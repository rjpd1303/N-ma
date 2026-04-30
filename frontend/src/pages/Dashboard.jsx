import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import Navbar from "../components/Navbar";
import { NBCard, NBButton, NBBadge, NBProgress } from "../components/nb";
import { BookOpen, Trophy, ClipboardList, Zap, Plus, FileCheck2, Award } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "teacher" ? <TeacherDashboard /> : <StudentDashboard />;
}

function StudentDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [courses, setCourses] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    (async () => {
      const [s, c, subs] = await Promise.all([
        api.get("/me/stats"),
        api.get("/courses/mine"),
        api.get("/me/submissions"),
      ]);
      setStats(s.data); setCourses(c.data); setSubmissions(subs.data);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="student-dashboard">
        <div>
          <div className="label-caps text-[#3E5A3E]">Bienvenido</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl uppercase text-[#1F5A2A]">{user.name}</h1>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
          <NBCard color="yellow" className="md:col-span-3 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="label-caps">Tu rango</div>
                <div className="font-display font-black text-5xl mt-1">NV {stats?.level ?? "-"}</div>
                <div className="font-mono text-sm mt-1">{stats?.xp ?? 0} XP totales</div>
              </div>
              <Zap className="w-14 h-14" strokeWidth={2.5} />
            </div>
            <div className="mt-4">
              <div className="label-caps mb-1.5">Progreso al Nivel {stats ? stats.level + 1 : "?"}</div>
              <NBProgress value={stats?.progress_percent ?? 0} color="#A5D6A7" />
            </div>
          </NBCard>

          <NBCard className="md:col-span-3 p-6">
            <div className="label-caps">Insignias ganadas</div>
            <div className="font-display font-black text-4xl">{stats?.earned_badges_count ?? 0} <span className="text-[#3E5A3E] text-xl">/ {stats?.badges?.length ?? 6}</span></div>
            <div className="grid grid-cols-6 gap-2 mt-4">
              {stats?.badges.map((b) => (
                <div key={b.id} className={`aspect-square nb-border flex items-center justify-center ${b.earned ? "" : "opacity-25"}`} style={{ background: b.earned ? b.color : "#fff" }} title={b.name} data-testid={`dash-badge-${b.id}`}>
                  <Award className="w-6 h-6" strokeWidth={2.5} />
                </div>
              ))}
            </div>
          </NBCard>

          <NBCard color="teal" className="md:col-span-2 p-6">
            <div className="label-caps">Inscritos</div>
            <div className="font-display font-black text-5xl">{courses.length}</div>
            <div className="font-mono text-sm">Cursos activos</div>
          </NBCard>
          <NBCard color="purple" className="md:col-span-2 p-6">
            <div className="label-caps">Entregas</div>
            <div className="font-display font-black text-5xl">{submissions.length}</div>
            <div className="font-mono text-sm">Tareas hechas</div>
          </NBCard>
          <NBCard className="md:col-span-2 p-6">
            <Trophy className="w-8 h-8 mb-2" />
            <div className="label-caps">Clasificación</div>
            <Link to="/leaderboard"><NBButton className="w-full mt-2" variant="dark" data-testid="dash-leaderboard-btn">Ver ranking</NBButton></Link>
          </NBCard>
        </div>

        {/* My courses */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-black text-2xl uppercase text-[#1F5A2A]">Mis cursos</h2>
            <Link to="/courses"><NBButton variant="ghost" data-testid="dash-browse-courses-btn">Ver todos <Plus className="inline w-4 h-4 ml-1" /></NBButton></Link>
          </div>
          {courses.length === 0 ? (
            <NBCard className="p-8 text-center"><p>Aún no tienes cursos. <Link to="/courses" className="underline font-bold">Explora el catálogo</Link>.</p></NBCard>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((c) => <CourseCard key={c.id} c={c} />)}
            </div>
          )}
        </section>

        {/* Recent submissions */}
        <section>
          <h2 className="font-display font-black text-2xl uppercase text-[#1F5A2A] mb-4">Entregas recientes</h2>
          {submissions.length === 0 ? (
            <NBCard className="p-6 text-sm text-[#3E5A3E]">Aún no tienes entregas — envía una para ganar XP.</NBCard>
          ) : (
            <NBCard className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#1F5A2A] text-white">
                  <tr className="text-left label-caps">
                    <th className="px-4 py-3">Actividad</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Puntaje</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.slice(0, 6).map((s) => (
                    <tr key={s.id} className="border-t-2 border-[#1F5A2A]" data-testid={`dash-submission-${s.id}`}>
                      <td className="px-4 py-3 font-bold">{s.activity_title}</td>
                      <td className="px-4 py-3"><NBBadge color={s.type === "quiz" ? "#A5D6A7" : "#C5E1A5"}>{s.type === "quiz" ? "quiz" : "tarea"}</NBBadge></td>
                      <td className="px-4 py-3"><NBBadge color={s.status === "graded" ? "#2E8B7F" : "#8BC34A"}>{s.status === "graded" ? "calificado" : "enviado"}</NBBadge></td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{s.score != null ? `${s.score}/${s.max_points}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </NBCard>
          )}
        </section>
      </main>
    </div>
  );
}

function TeacherDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [pending, setPending] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await api.get("/courses/mine");
      setCourses(c.data);
      // Gather pending submissions across all courses
      const subsArr = await Promise.all(c.data.map((co) => api.get(`/courses/${co.id}/submissions`).then(r => r.data).catch(() => [])));
      const all = subsArr.flat().filter(s => s.type === "assignment" && s.status !== "graded");
      setPending(all);
      setLoaded(true);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="teacher-dashboard">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="label-caps text-[#3E5A3E]">Consola del profesor</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl uppercase text-[#1F5A2A]">{user.name}</h1>
          </div>
          <Link to="/courses/new"><NBButton variant="dark" data-testid="teacher-create-course-btn"><Plus className="inline w-4 h-4 mr-1" /> Nuevo curso</NBButton></Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <NBCard color="yellow" className="p-6"><Stat label="Cursos" value={courses.length} icon={<BookOpen />} /></NBCard>
          <NBCard color="purple" className="p-6"><Stat label="Estudiantes" value={courses.reduce((s, c) => s + (c.student_count || 0), 0)} icon={<ClipboardList />} /></NBCard>
          <NBCard color="teal" className="p-6"><Stat label="Por calificar" value={pending.length} icon={<FileCheck2 />} /></NBCard>
        </div>

        <section>
          <h2 className="font-display font-black text-2xl uppercase text-[#1F5A2A] mb-4">Tus cursos</h2>
          {loaded && courses.length === 0 ? (
            <NBCard className="p-8 text-center">
              <p className="mb-3">Aún no tienes cursos. Empieza el primero.</p>
              <Link to="/courses/new"><NBButton variant="primary" data-testid="teacher-empty-create-btn">Crear curso</NBButton></Link>
            </NBCard>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((c) => <CourseCard key={c.id} c={c} manage />)}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display font-black text-2xl uppercase text-[#1F5A2A] mb-4">Pendientes por calificar</h2>
          {pending.length === 0 ? (
            <NBCard className="p-6 text-sm text-[#3E5A3E]">Todo al día ✓</NBCard>
          ) : (
            <div className="space-y-3">
              {pending.slice(0, 6).map((s) => (
                <NBCard key={s.id} className="p-4 flex items-center justify-between" data-testid={`teacher-pending-${s.id}`}>
                  <div>
                    <div className="font-display font-black">{s.activity_title}</div>
                    <div className="text-sm text-[#3E5A3E]">por {s.student_name}</div>
                  </div>
                  <Link to={`/courses/${s.course_id}/manage?tab=submissions`}>
                    <NBButton variant="primary">Revisar</NBButton>
                  </Link>
                </NBCard>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <div className="label-caps">{label}</div>
        <div className="font-display font-black text-5xl">{value}</div>
      </div>
      <div className="w-10 h-10">{icon && React.cloneElement(icon, { className: "w-10 h-10", strokeWidth: 2.5 })}</div>
    </div>
  );
}

function CourseCard({ c, manage }) {
  return (
    <Link to={manage ? `/courses/${c.id}/manage` : `/courses/${c.id}`} className="block nb-press" data-testid={`course-card-${c.id}`}>
      <NBCard className="overflow-hidden">
        <div className="h-24 border-b-2 border-black flex items-end p-4" style={{ background: c.cover_color || "#8BC34A" }}>
          <span className="label-caps">{c.subject}</span>
        </div>
        <div className="p-4">
          <div className="font-display font-black text-lg leading-tight">{c.title}</div>
          <p className="text-sm text-[#4A4A4A] line-clamp-2 mt-1">{c.description}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="label-caps">{c.student_count || 0} estudiantes</span>
            <NBBadge color={manage ? "#8BC34A" : "#A5D6A7"}>{manage ? "Administrar" : "Abrir"}</NBBadge>
          </div>
        </div>
      </NBCard>
    </Link>
  );
}
