from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
import io

# ---------- Setup ----------
REQUIRED_ENV = ("MONGO_URL", "DB_NAME", "JWT_SECRET")
DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)

mongo_url = os.environ.get("MONGO_URL")
db_name = os.environ.get("DB_NAME")
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000) if mongo_url else None
db = client[db_name] if client is not None and db_name else None
db_startup_error: Optional[str] = None

JWT_ALGORITHM = "HS256"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

app = FastAPI(title="EduQuest API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("eduquest")

def missing_required_env() -> List[str]:
    return [key for key in REQUIRED_ENV if not os.environ.get(key)]

def cors_origins() -> List[str]:
    raw = os.environ.get("CORS_ORIGINS")
    if not raw:
        return list(DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

@app.middleware("http")
async def require_configured_backend(request: Request, call_next):
    if request.url.path.endswith("/api/health"):
        return await call_next(request)
    missing = missing_required_env()
    if request.url.path.startswith("/api") and missing:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Backend is not fully configured",
                "missing_env": missing,
            },
        )
    if request.url.path.startswith("/api") and db_startup_error:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "Database startup failed",
                "error": db_startup_error,
            },
        )
    return await call_next(request)

# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().isoformat()

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": now_utc() + timedelta(days=7)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=False, samesite="lax", max_age=604800, path="/")

def clean_user(u: dict) -> dict:
    if not u: return u
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "xp": u.get("xp", 0),
        "level": u.get("level", 1),
        "avatar_color": u.get("avatar_color", "#FFE156"),
        "created_at": u.get("created_at"),
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden: wrong role")
        return user
    return checker

# ---------- Gamification ----------
BADGES = [
    {"id": "first_enroll", "name": "Primeros Pasos", "description": "Te inscribiste en tu primer curso", "icon": "Compass", "color": "#A5D6A7"},
    {"id": "first_submission", "name": "Pionero", "description": "Entregaste tu primera actividad", "icon": "Rocket", "color": "#C5E1A5"},
    {"id": "quiz_master", "name": "Maestro del Quiz", "description": "Sacaste 90%+ en un quiz", "icon": "Trophy", "color": "#8BC34A"},
    {"id": "level_5", "name": "Estrella Naciente", "description": "Llegaste al Nivel 5", "icon": "Star", "color": "#FF6B6B"},
    {"id": "level_10", "name": "Erudito", "description": "Llegaste al Nivel 10", "icon": "GraduationCap", "color": "#2E8B7F"},
    {"id": "three_courses", "name": "Polímata", "description": "Te inscribiste en 3+ cursos", "icon": "BookOpen", "color": "#A5D6A7"},
]

def xp_to_level(xp: int) -> int:
    return max(1, 1 + xp // 100)

async def grant_badge(user_id: str, badge_id: str):
    exists = await db.user_badges.find_one({"user_id": user_id, "badge_id": badge_id})
    if exists:
        return False
    await db.user_badges.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "badge_id": badge_id,
        "earned_at": now_iso(),
    })
    return True

async def add_xp(user_id: str, amount: int):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return
    new_xp = user.get("xp", 0) + amount
    new_level = xp_to_level(new_xp)
    await db.users.update_one({"id": user_id}, {"$set": {"xp": new_xp, "level": new_level}})
    if new_level >= 5:
        await grant_badge(user_id, "level_5")
    if new_level >= 10:
        await grant_badge(user_id, "level_10")

# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Literal["teacher", "student"] = "student"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CourseIn(BaseModel):
    title: str
    description: str
    subject: str
    cover_color: str = "#FFE156"

class LessonIn(BaseModel):
    title: str
    content: str  # rich text / markdown
    order: int = 0

class ResourceIn(BaseModel):
    title: str
    type: Literal["link", "file"]
    url: Optional[str] = None  # for link type
    file_id: Optional[str] = None  # for file type
    description: Optional[str] = ""

class QuizQuestionIn(BaseModel):
    question: str
    options: List[str]
    correct_index: int

class ActivityIn(BaseModel):
    title: str
    description: str
    type: Literal["assignment", "quiz"]
    due_date: Optional[str] = None  # ISO date
    max_points: int = 100
    xp_reward: int = 50
    quiz_questions: Optional[List[QuizQuestionIn]] = None

class SubmissionFileIn(BaseModel):
    activity_id: str
    file_id: Optional[str] = None
    text_response: Optional[str] = None

class QuizSubmissionIn(BaseModel):
    activity_id: str
    answers: List[int]  # index of selected option per question

class GradeIn(BaseModel):
    score: int
    feedback: str = ""

# ---------- Health ----------
@app.get("/")
async def root():
    return {"ok": True, "service": "EduQuest API"}

@api.get("/health")
async def health():
    missing = missing_required_env()
    database = {
        "configured": db is not None,
        "ok": False,
        "name": db_name if db_name else None,
    }
    if db is not None and client is not None:
        try:
            await client.admin.command("ping")
            database["ok"] = True
        except Exception as exc:
            database["error"] = f"{type(exc).__name__}: {exc}"
    if db_startup_error:
        database["startup_error"] = db_startup_error
    return {
        "ok": not missing and database["ok"] and not db_startup_error,
        "missing_env": missing,
        "database": database,
    }

# ---------- Auth ----------
@api.post("/auth/register")
async def register(data: RegisterIn, response: Response):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "xp": 0,
        "level": 1,
        "avatar_color": "#FFE156",
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    return {"user": clean_user(user_doc), "token": token}

@api.post("/auth/login")
async def login(data: LoginIn, response: Response):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return {"user": clean_user(user), "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)

# ---------- Files ----------
@api.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 10MB)")
    file_id = str(uuid.uuid4())
    await db.files.insert_one({
        "id": file_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "data_b64": base64.b64encode(content).decode("ascii"),
        "size": len(content),
        "owner_id": user["id"],
        "created_at": now_iso(),
    })
    return {"id": file_id, "filename": file.filename, "size": len(content),
            "content_type": file.content_type}

@api.get("/files/{file_id}")
async def get_file(file_id: str):
    f = await db.files.find_one({"id": file_id}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    data = base64.b64decode(f["data_b64"])
    return StreamingResponse(
        io.BytesIO(data),
        media_type=f["content_type"],
        headers={"Content-Disposition": f'inline; filename="{f["filename"]}"'}
    )

# ---------- Courses ----------
@api.post("/courses")
async def create_course(data: CourseIn, user: dict = Depends(require_role("teacher"))):
    course_id = str(uuid.uuid4())
    doc = {
        "id": course_id,
        "title": data.title,
        "description": data.description,
        "subject": data.subject,
        "cover_color": data.cover_color,
        "teacher_id": user["id"],
        "teacher_name": user["name"],
        "created_at": now_iso(),
    }
    await db.courses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/courses")
async def list_courses(user: dict = Depends(get_current_user)):
    courses = await db.courses.find({}, {"_id": 0}).to_list(500)
    # add enrollment + student count for convenience
    for c in courses:
        c["student_count"] = await db.enrollments.count_documents({"course_id": c["id"]})
        c["is_enrolled"] = bool(await db.enrollments.find_one({"course_id": c["id"], "student_id": user["id"]}))
    return courses

@api.get("/courses/mine")
async def my_courses(user: dict = Depends(get_current_user)):
    if user["role"] == "teacher":
        courses = await db.courses.find({"teacher_id": user["id"]}, {"_id": 0}).to_list(500)
    else:
        enrolls = await db.enrollments.find({"student_id": user["id"]}, {"_id": 0}).to_list(500)
        course_ids = [e["course_id"] for e in enrolls]
        courses = await db.courses.find({"id": {"$in": course_ids}}, {"_id": 0}).to_list(500)
    for c in courses:
        c["student_count"] = await db.enrollments.count_documents({"course_id": c["id"]})
        c["is_enrolled"] = True if user["role"] == "student" else False
    return courses

@api.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    course = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    course["student_count"] = await db.enrollments.count_documents({"course_id": course_id})
    course["is_enrolled"] = bool(await db.enrollments.find_one({"course_id": course_id, "student_id": user["id"]}))
    course["is_owner"] = course["teacher_id"] == user["id"]
    return course

@api.post("/courses/{course_id}/enroll")
async def enroll(course_id: str, user: dict = Depends(require_role("student"))):
    course = await db.courses.find_one({"id": course_id})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    existing = await db.enrollments.find_one({"course_id": course_id, "student_id": user["id"]})
    if existing:
        return {"ok": True, "already": True}
    await db.enrollments.insert_one({
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "student_id": user["id"],
        "enrolled_at": now_iso(),
    })
    await grant_badge(user["id"], "first_enroll")
    count = await db.enrollments.count_documents({"student_id": user["id"]})
    if count >= 3:
        await grant_badge(user["id"], "three_courses")
    return {"ok": True}

@api.delete("/courses/{course_id}")
async def delete_course(course_id: str, user: dict = Depends(require_role("teacher"))):
    course = await db.courses.find_one({"id": course_id})
    if not course or course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your course")
    await db.courses.delete_one({"id": course_id})
    await db.lessons.delete_many({"course_id": course_id})
    await db.resources.delete_many({"course_id": course_id})
    await db.activities.delete_many({"course_id": course_id})
    await db.enrollments.delete_many({"course_id": course_id})
    return {"ok": True}

# ---------- Lessons ----------
@api.post("/courses/{course_id}/lessons")
async def create_lesson(course_id: str, data: LessonIn, user: dict = Depends(require_role("teacher"))):
    course = await db.courses.find_one({"id": course_id})
    if not course or course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your course")
    doc = {"id": str(uuid.uuid4()), "course_id": course_id, **data.model_dump(),
           "created_at": now_iso()}
    await db.lessons.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/courses/{course_id}/lessons")
async def list_lessons(course_id: str, user: dict = Depends(get_current_user)):
    return await db.lessons.find({"course_id": course_id}, {"_id": 0}).sort("order", 1).to_list(200)

@api.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, user: dict = Depends(require_role("teacher"))):
    lesson = await db.lessons.find_one({"id": lesson_id})
    if not lesson:
        raise HTTPException(status_code=404, detail="Not found")
    course = await db.courses.find_one({"id": lesson["course_id"]})
    if course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.lessons.delete_one({"id": lesson_id})
    return {"ok": True}

# ---------- Resources ----------
@api.post("/courses/{course_id}/resources")
async def create_resource(course_id: str, data: ResourceIn, user: dict = Depends(require_role("teacher"))):
    course = await db.courses.find_one({"id": course_id})
    if not course or course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your course")
    doc = {"id": str(uuid.uuid4()), "course_id": course_id, **data.model_dump(),
           "created_at": now_iso()}
    await db.resources.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/courses/{course_id}/resources")
async def list_resources(course_id: str, user: dict = Depends(get_current_user)):
    return await db.resources.find({"course_id": course_id}, {"_id": 0}).to_list(200)

@api.delete("/resources/{resource_id}")
async def delete_resource(resource_id: str, user: dict = Depends(require_role("teacher"))):
    r = await db.resources.find_one({"id": resource_id})
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    course = await db.courses.find_one({"id": r["course_id"]})
    if course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.resources.delete_one({"id": resource_id})
    return {"ok": True}

# ---------- Activities ----------
@api.post("/courses/{course_id}/activities")
async def create_activity(course_id: str, data: ActivityIn, user: dict = Depends(require_role("teacher"))):
    course = await db.courses.find_one({"id": course_id})
    if not course or course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your course")
    payload = data.model_dump()
    if payload["type"] == "quiz" and not payload.get("quiz_questions"):
        raise HTTPException(status_code=400, detail="Quiz requires questions")
    doc = {"id": str(uuid.uuid4()), "course_id": course_id, **payload,
           "created_at": now_iso()}
    await db.activities.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/courses/{course_id}/activities")
async def list_activities(course_id: str, user: dict = Depends(get_current_user)):
    activities = await db.activities.find({"course_id": course_id}, {"_id": 0}).to_list(200)
    if user["role"] == "student":
        # attach student's own submission status
        for a in activities:
            sub = await db.submissions.find_one(
                {"activity_id": a["id"], "student_id": user["id"]},
                {"_id": 0}
            )
            a["my_submission"] = sub
            # hide correct answers
            if a.get("quiz_questions"):
                a["quiz_questions"] = [
                    {"question": q["question"], "options": q["options"]}
                    for q in a["quiz_questions"]
                ]
    return activities

@api.get("/activities/{activity_id}")
async def get_activity(activity_id: str, user: dict = Depends(get_current_user)):
    a = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    if user["role"] == "student":
        sub = await db.submissions.find_one(
            {"activity_id": activity_id, "student_id": user["id"]}, {"_id": 0}
        )
        a["my_submission"] = sub
        if a.get("quiz_questions"):
            # If student already submitted, reveal correct answers (for review screen)
            if sub:
                pass  # keep correct_index visible
            else:
                a["quiz_questions"] = [
                    {"question": q["question"], "options": q["options"]}
                    for q in a["quiz_questions"]
                ]
    return a

@api.delete("/activities/{activity_id}")
async def delete_activity(activity_id: str, user: dict = Depends(require_role("teacher"))):
    a = await db.activities.find_one({"id": activity_id})
    if not a:
        raise HTTPException(status_code=404, detail="Not found")
    course = await db.courses.find_one({"id": a["course_id"]})
    if course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    await db.activities.delete_one({"id": activity_id})
    return {"ok": True}

# ---------- Submissions ----------
async def _check_enrolled(student_id: str, course_id: str):
    enr = await db.enrollments.find_one({"student_id": student_id, "course_id": course_id})
    if not enr:
        raise HTTPException(status_code=403, detail="Not enrolled in course")

@api.post("/activities/{activity_id}/submit-assignment")
async def submit_assignment(activity_id: str, data: SubmissionFileIn, user: dict = Depends(require_role("student"))):
    activity = await db.activities.find_one({"id": activity_id})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["type"] != "assignment":
        raise HTTPException(status_code=400, detail="Activity is not an assignment")
    await _check_enrolled(user["id"], activity["course_id"])
    existing = await db.submissions.find_one({"activity_id": activity_id, "student_id": user["id"]})
    sub_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {
        "id": sub_id,
        "activity_id": activity_id,
        "course_id": activity["course_id"],
        "student_id": user["id"],
        "student_name": user["name"],
        "type": "assignment",
        "file_id": data.file_id,
        "text_response": data.text_response,
        "status": "submitted",
        "score": None,
        "feedback": None,
        "graded_at": None,
        "submitted_at": now_iso(),
    }
    if existing:
        await db.submissions.update_one({"id": sub_id}, {"$set": doc})
    else:
        await db.submissions.insert_one(doc)
        await grant_badge(user["id"], "first_submission")
    return {k: v for k, v in doc.items() if k != "_id"}

@api.post("/activities/{activity_id}/submit-quiz")
async def submit_quiz(activity_id: str, data: QuizSubmissionIn, user: dict = Depends(require_role("student"))):
    activity = await db.activities.find_one({"id": activity_id}, {"_id": 0})
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity["type"] != "quiz":
        raise HTTPException(status_code=400, detail="Activity is not a quiz")
    await _check_enrolled(user["id"], activity["course_id"])
    questions = activity.get("quiz_questions", [])
    if len(data.answers) != len(questions):
        raise HTTPException(status_code=400, detail="Answer count mismatch")
    correct = sum(1 for i, q in enumerate(questions) if data.answers[i] == q["correct_index"])
    total = len(questions)
    percent = round((correct / total) * 100) if total else 0
    score = round(percent * activity.get("max_points", 100) / 100)
    existing = await db.submissions.find_one({"activity_id": activity_id, "student_id": user["id"]})
    sub_id = existing["id"] if existing else str(uuid.uuid4())
    xp_awarded = 0
    if not existing:
        # award XP based on percentage of reward
        xp_awarded = round(activity.get("xp_reward", 50) * percent / 100)
    doc = {
        "id": sub_id,
        "activity_id": activity_id,
        "course_id": activity["course_id"],
        "student_id": user["id"],
        "student_name": user["name"],
        "type": "quiz",
        "answers": data.answers,
        "correct_count": correct,
        "total_count": total,
        "percent": percent,
        "score": score,
        "status": "graded",
        "feedback": f"Auto-graded: {correct}/{total} correct",
        "submitted_at": now_iso(),
        "graded_at": now_iso(),
        "xp_awarded": xp_awarded,
    }
    if existing:
        await db.submissions.update_one({"id": sub_id}, {"$set": doc})
    else:
        await db.submissions.insert_one(doc)
        await grant_badge(user["id"], "first_submission")
        if xp_awarded:
            await add_xp(user["id"], xp_awarded)
        if percent >= 90:
            await grant_badge(user["id"], "quiz_master")
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/courses/{course_id}/submissions")
async def course_submissions(course_id: str, user: dict = Depends(require_role("teacher"))):
    course = await db.courses.find_one({"id": course_id})
    if not course or course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    subs = await db.submissions.find({"course_id": course_id}, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    # enrich with activity title
    for s in subs:
        a = await db.activities.find_one({"id": s["activity_id"]}, {"_id": 0, "title": 1, "type": 1, "max_points": 1})
        s["activity_title"] = a["title"] if a else "Deleted"
        s["activity_type"] = a["type"] if a else "?"
        s["max_points"] = a.get("max_points", 100) if a else 100
    return subs

@api.get("/me/submissions")
async def my_submissions(user: dict = Depends(get_current_user)):
    subs = await db.submissions.find({"student_id": user["id"]}, {"_id": 0}).sort("submitted_at", -1).to_list(500)
    for s in subs:
        a = await db.activities.find_one({"id": s["activity_id"]}, {"_id": 0})
        s["activity_title"] = a["title"] if a else "Deleted"
        s["activity_type"] = a["type"] if a else "?"
        s["max_points"] = a.get("max_points", 100) if a else 100
    return subs

@api.post("/submissions/{submission_id}/grade")
async def grade_submission(submission_id: str, data: GradeIn, user: dict = Depends(require_role("teacher"))):
    sub = await db.submissions.find_one({"id": submission_id}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    course = await db.courses.find_one({"id": sub["course_id"]})
    if course["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your course")
    if sub["type"] != "assignment":
        raise HTTPException(status_code=400, detail="Only assignments can be manually graded")
    activity = await db.activities.find_one({"id": sub["activity_id"]}, {"_id": 0})
    already_graded = sub.get("status") == "graded"
    await db.submissions.update_one(
        {"id": submission_id},
        {"$set": {"status": "graded", "score": data.score, "feedback": data.feedback,
                  "graded_at": now_iso()}}
    )
    if not already_graded:
        max_points = activity.get("max_points", 100)
        xp_reward = activity.get("xp_reward", 50)
        percent = data.score / max_points if max_points else 0
        xp_awarded = round(xp_reward * percent)
        if xp_awarded > 0:
            await add_xp(sub["student_id"], xp_awarded)
        if percent >= 0.9:
            await grant_badge(sub["student_id"], "quiz_master")
    return {"ok": True}

# ---------- Gamification ----------
@api.get("/me/stats")
async def my_stats(user: dict = Depends(get_current_user)):
    badges_earned = await db.user_badges.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    earned_ids = {b["badge_id"] for b in badges_earned}
    all_badges = [{**b, "earned": b["id"] in earned_ids,
                   "earned_at": next((be["earned_at"] for be in badges_earned if be["badge_id"] == b["id"]), None)}
                  for b in BADGES]
    xp = user.get("xp", 0)
    level = xp_to_level(xp)
    next_level_xp = level * 100
    progress_percent = int(((xp - (level - 1) * 100) / 100) * 100)
    courses_enrolled = await db.enrollments.count_documents({"student_id": user["id"]})
    submissions_count = await db.submissions.count_documents({"student_id": user["id"]})
    return {
        "xp": xp,
        "level": level,
        "next_level_xp": next_level_xp,
        "progress_percent": progress_percent,
        "badges": all_badges,
        "earned_badges_count": len(earned_ids),
        "courses_enrolled": courses_enrolled,
        "submissions_count": submissions_count,
    }

@api.get("/me/upcoming")
async def upcoming_activities(user: dict = Depends(get_current_user)):
    """Return upcoming activities for student's enrolled courses with due dates in the future or no submission yet."""
    enrolls = await db.enrollments.find({"student_id": user["id"]}, {"_id": 0}).to_list(500)
    course_ids = [e["course_id"] for e in enrolls]
    if not course_ids:
        return []
    activities = await db.activities.find({"course_id": {"$in": course_ids}}, {"_id": 0}).to_list(500)
    # attach submission state + course title
    result = []
    for a in activities:
        sub = await db.submissions.find_one({"activity_id": a["id"], "student_id": user["id"]}, {"_id": 0})
        if sub:
            continue  # skip already-submitted
        course = await db.courses.find_one({"id": a["course_id"]}, {"_id": 0})
        result.append({
            "id": a["id"],
            "title": a["title"],
            "type": a["type"],
            "due_date": a.get("due_date"),
            "xp_reward": a.get("xp_reward", 50),
            "course_id": a["course_id"],
            "course_title": course["title"] if course else "",
            "course_color": course.get("cover_color", "#8BC34A") if course else "#8BC34A",
        })
    # sort by due_date asc, nulls last
    result.sort(key=lambda x: (x.get("due_date") is None, x.get("due_date") or ""))
    return result[:10]

@api.get("/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user)):
    users = await db.users.find({"role": "student"}, {"_id": 0, "password_hash": 0}).sort("xp", -1).limit(50).to_list(50)
    result = []
    for i, u in enumerate(users):
        badge_count = await db.user_badges.count_documents({"user_id": u["id"]})
        result.append({
            "rank": i + 1,
            "id": u["id"],
            "name": u["name"],
            "xp": u.get("xp", 0),
            "level": u.get("level", 1),
            "avatar_color": u.get("avatar_color", "#FFE156"),
            "badge_count": badge_count,
            "is_me": u["id"] == user["id"],
        })
    return result

async def seed_sample_course(db, teacher_id: str):
    """Seed a demo course about medicinal plants if none exists."""
    existing = await db.courses.find_one({"teacher_id": teacher_id, "title": "Plantas Medicinales 101"})
    if existing:
        return
    course_id = str(uuid.uuid4())
    await db.courses.insert_one({
        "id": course_id,
        "title": "Plantas Medicinales 101",
        "description": "Introducción al mundo de las plantas medicinales, sus principios activos y aplicaciones terapéuticas tradicionales.",
        "subject": "Botánica",
        "cover_color": "#8BC34A",
        "teacher_id": teacher_id,
        "teacher_name": "NUMA",
        "created_at": now_iso(),
    })
    lessons = [
        {"title": "¿Qué son las plantas medicinales?",
         "content": "# Bienvenido a NUMA\n\nLas **plantas medicinales** son aquellas que contienen principios activos con efectos terapéuticos sobre el organismo.\n\n## Ejemplos clásicos\n\n- **Manzanilla** (*Matricaria chamomilla*): digestiva y relajante\n- **Tilo** (*Tilia platyphyllos*): ansiolítico suave\n- **Equinácea** (*Echinacea purpurea*): inmunoestimulante\n- **Caléndula** (*Calendula officinalis*): cicatrizante tópica\n\n> El uso de hierbas con fines medicinales se remonta a más de 60.000 años.",
         "order": 1},
        {"title": "Principios activos y modos de extracción",
         "content": "## Principios activos comunes\n\n1. **Alcaloides** — efectos potentes sobre SNC (ej. cafeína)\n2. **Flavonoides** — antioxidantes (ej. quercetina)\n3. **Aceites esenciales** — aromáticos y antimicrobianos\n4. **Taninos** — astringentes (ej. corteza de roble)\n\n## Métodos de preparación\n\n- **Infusión**: hojas y flores en agua caliente sin hervir\n- **Decocción**: raíces y cortezas hervidas 10-15 min\n- **Tintura**: maceración en alcohol 30-40°\n- **Cataplasma**: aplicación tópica de planta machacada",
         "order": 2},
        {"title": "Buenas prácticas y precauciones",
         "content": "## Antes de usar cualquier planta\n\n- **Consulta** a un profesional de salud si tomas medicamentos\n- Verifica **identificación botánica** correcta\n- Empieza con **dosis bajas** para detectar alergias\n- Embarazadas y niños requieren **atención especial**\n\n## Plantas con interacciones conocidas\n\n| Planta | Interacción |\n|--------|-------------|\n| Hierba de San Juan | Antidepresivos, anticonceptivos |\n| Ginkgo | Anticoagulantes |\n| Regaliz | Hipertensión |",
         "order": 3},
    ]
    for l in lessons:
        await db.lessons.insert_one({"id": str(uuid.uuid4()), "course_id": course_id, **l, "created_at": now_iso()})
    resources = [
        {"title": "Atlas de plantas medicinales (OMS)", "type": "link",
         "url": "https://www.who.int/medicines/areas/traditional/en/", "description": "Monografías oficiales de la OMS"},
        {"title": "Guía visual de hojas y flores", "type": "link",
         "url": "https://es.wikipedia.org/wiki/Planta_medicinal", "description": "Referencia general en Wikipedia"},
    ]
    for r in resources:
        await db.resources.insert_one({"id": str(uuid.uuid4()), "course_id": course_id, **r,
                                        "url": r.get("url"), "file_id": None,
                                        "created_at": now_iso()})
    # Quiz activity
    await db.activities.insert_one({
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "title": "Quiz: Conoce tus hierbas",
        "description": "Pon a prueba lo aprendido sobre plantas medicinales básicas.",
        "type": "quiz",
        "due_date": None,
        "max_points": 100,
        "xp_reward": 80,
        "quiz_questions": [
            {"question": "¿Qué planta es conocida por su efecto digestivo y relajante?",
             "options": ["Equinácea", "Manzanilla", "Caléndula", "Romero"], "correct_index": 1},
            {"question": "¿Qué método se usa típicamente para extraer principios activos de raíces y cortezas?",
             "options": ["Infusión", "Tintura", "Decocción", "Cataplasma"], "correct_index": 2},
            {"question": "¿Qué tipo de principio activo es la cafeína?",
             "options": ["Flavonoide", "Tanino", "Aceite esencial", "Alcaloide"], "correct_index": 3},
            {"question": "¿Qué planta puede interactuar con anticoagulantes?",
             "options": ["Tilo", "Ginkgo", "Manzanilla", "Caléndula"], "correct_index": 1},
        ],
        "created_at": now_iso(),
    })
    # Assignment activity
    await db.activities.insert_one({
        "id": str(uuid.uuid4()),
        "course_id": course_id,
        "title": "Tarea: Mi botiquín verde",
        "description": "Investiga y describe 3 plantas medicinales que crezcan en tu región. Para cada una indica: nombre común y científico, principal uso terapéutico, y forma de preparación recomendada. Adjunta una foto si puedes.",
        "type": "assignment",
        "due_date": None,
        "max_points": 100,
        "xp_reward": 120,
        "quiz_questions": None,
        "created_at": now_iso(),
    })

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    global db_startup_error
    missing = missing_required_env()
    if missing or db is None:
        db_startup_error = None
        logger.error("NUMA startup skipped; missing env vars: %s", ", ".join(missing))
        return
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.courses.create_index("id", unique=True)
        await db.enrollments.create_index([("course_id", 1), ("student_id", 1)], unique=True)
        await db.user_badges.create_index([("user_id", 1), ("badge_id", 1)], unique=True)
        # Seed admin + demo
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@eduquest.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            admin_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": admin_id,
                "email": admin_email,
                "name": "NUMA",
                "password_hash": hash_password(admin_password),
                "role": "teacher",
                "xp": 0, "level": 1, "avatar_color": "#8BC34A",
                "created_at": now_iso(),
            })
            existing = {"id": admin_id}
        await seed_sample_course(db, existing["id"])
        db_startup_error = None
        logger.info("NUMA startup complete")
    except Exception as exc:
        db_startup_error = f"{type(exc).__name__}: {exc}"
        logger.exception("NUMA startup failed")

@app.on_event("shutdown")
async def shutdown():
    if client is not None:
        client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
