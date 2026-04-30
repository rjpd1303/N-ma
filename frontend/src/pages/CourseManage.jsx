import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, API } from "../lib/api";
import Navbar from "../components/Navbar";
import { NBCard, NBButton, NBBadge, NBInput, NBTextarea } from "../components/nb";
import { Plus, Trash2, FileText, LinkIcon, BookOpen, ClipboardList, Upload, Star } from "lucide-react";
import { toast } from "sonner";

export default function CourseManage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState(params.get("tab") || "lessons");
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [activities, setActivities] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const loadAll = async () => {
    const [c, ls, rs, as, ss] = await Promise.all([
      api.get(`/courses/${id}`),
      api.get(`/courses/${id}/lessons`),
      api.get(`/courses/${id}/resources`),
      api.get(`/courses/${id}/activities`),
      api.get(`/courses/${id}/submissions`),
    ]);
    setCourse(c.data); setLessons(ls.data); setResources(rs.data); setActivities(as.data); setSubmissions(ss.data);
  };
  useEffect(() => { loadAll(); }, [id]);

  const switchTab = (t) => { setTab(t); setParams({ tab: t }); };

  if (!course) return <div className="min-h-screen"><Navbar /></div>;

  const tabs = [
    { id: "lessons", label: "Lecciones", icon: BookOpen },
    { id: "resources", label: "Recursos", icon: FileText },
    { id: "activities", label: "Actividades", icon: ClipboardList },
    { id: "submissions", label: `Entregas (${submissions.length})`, icon: Star },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="course-manage">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to={`/courses/${id}`} className="label-caps underline">← Volver al curso</Link>
            <h1 className="font-display font-black text-4xl uppercase mt-1 text-[#1F5A2A]">Gestionar · {course.title}</h1>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => switchTab(t.id)}
              className={`px-4 py-2 nb-border nb-press font-bold text-sm uppercase tracking-wider ${tab === t.id ? "bg-[#8BC34A] nb-shadow" : "bg-white"}`}
              data-testid={`manage-tab-${t.id}`}>
              <t.icon className="w-4 h-4 inline mr-1" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "lessons" && <LessonsPanel courseId={id} lessons={lessons} reload={loadAll} />}
        {tab === "resources" && <ResourcesPanel courseId={id} resources={resources} reload={loadAll} />}
        {tab === "activities" && <ActivitiesPanel courseId={id} activities={activities} reload={loadAll} />}
        {tab === "submissions" && <SubmissionsPanel submissions={submissions} reload={loadAll} />}
      </main>
    </div>
  );
}

function LessonsPanel({ courseId, lessons, reload }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [order, setOrder] = useState(0);
  const submit = async (e) => {
    e.preventDefault();
    await api.post(`/courses/${courseId}/lessons`, { title, content, order: Number(order) });
    setTitle(""); setContent(""); setOrder(0); setOpen(false); toast.success("Lección agregada");
    reload();
  };
  const del = async (lid) => { if (!window.confirm("¿Eliminar?")) return; await api.delete(`/lessons/${lid}`); reload(); };
  return (
    <div className="space-y-3">
      {!open && <NBButton variant="dark" onClick={() => setOpen(true)} data-testid="add-lesson-btn"><Plus className="inline w-4 h-4 mr-1" /> Agregar lección</NBButton>}
      {open && (
        <NBCard className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <NBInput placeholder="Título de la lección" value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="lesson-title-input" />
            <NBTextarea placeholder="Contenido de la lección (texto / markdown)" value={content} onChange={(e) => setContent(e.target.value)} rows={8} required data-testid="lesson-content-input" />
            <NBInput type="number" placeholder="Orden" value={order} onChange={(e) => setOrder(e.target.value)} />
            <div className="flex gap-2">
              <NBButton type="submit" variant="primary" data-testid="lesson-save-btn">Guardar lección</NBButton>
              <NBButton type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</NBButton>
            </div>
          </form>
        </NBCard>
      )}
      {lessons.map((l) => (
        <NBCard key={l.id} className="p-4 flex items-start justify-between gap-3">
          <div><div className="font-display font-black">{l.title}</div><div className="text-sm text-[#3E5A3E] whitespace-pre-wrap line-clamp-3">{l.content}</div></div>
          <button onClick={() => del(l.id)} className="nb-border p-2 nb-press bg-[#FF6B6B] text-white" data-testid={`delete-lesson-${l.id}`}><Trash2 className="w-4 h-4" /></button>
        </NBCard>
      ))}
    </div>
  );
}

function ResourcesPanel({ courseId, resources, reload }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("link");
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [description, setDescription] = useState("");
  const [file, setFile] = useState(null); const [uploading, setUploading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    let payload = { title, type, description };
    if (type === "link") payload.url = url;
    if (type === "file") {
      if (!file) return toast.error("Elige un archivo");
      setUploading(true);
      const fd = new FormData(); fd.append("file", file);
      try {
        const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        payload.file_id = data.id;
      } catch (e) { setUploading(false); return toast.error("Error al subir"); }
      setUploading(false);
    }
    await api.post(`/courses/${courseId}/resources`, payload);
    setTitle(""); setUrl(""); setDescription(""); setFile(null); setOpen(false); toast.success("Recurso agregado");
    reload();
  };
  const del = async (rid) => { if (!window.confirm("¿Eliminar?")) return; await api.delete(`/resources/${rid}`); reload(); };

  return (
    <div className="space-y-3">
      {!open && <NBButton variant="dark" onClick={() => setOpen(true)} data-testid="add-resource-btn"><Plus className="inline w-4 h-4 mr-1" /> Agregar recurso</NBButton>}
      {open && (
        <NBCard className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setType("link")} className={`flex-1 px-3 py-2 nb-border nb-press ${type === "link" ? "bg-[#A5D6A7]" : "bg-white"}`} data-testid="resource-type-link"><LinkIcon className="inline w-4 h-4 mr-1" /> Enlace</button>
              <button type="button" onClick={() => setType("file")} className={`flex-1 px-3 py-2 nb-border nb-press ${type === "file" ? "bg-[#C5E1A5]" : "bg-white"}`} data-testid="resource-type-file"><FileText className="inline w-4 h-4 mr-1" /> Archivo</button>
            </div>
            <NBInput placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="resource-title-input" />
            {type === "link" && <NBInput placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} required data-testid="resource-url-input" />}
            {type === "file" && <input type="file" onChange={(e) => setFile(e.target.files[0])} required className="w-full nb-border bg-white p-2" data-testid="resource-file-input" />}
            <NBInput placeholder="Descripción corta (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <NBButton type="submit" variant="primary" disabled={uploading} data-testid="resource-save-btn">{uploading ? "Subiendo..." : "Guardar"}</NBButton>
              <NBButton type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</NBButton>
            </div>
          </form>
        </NBCard>
      )}
      {resources.map((r) => (
        <NBCard key={r.id} className="p-4 flex items-start justify-between gap-3">
          <a href={r.type === "link" ? r.url : `${API}/files/${r.file_id}`} target="_blank" rel="noopener noreferrer" className="flex-1">
            <div className="font-bold">{r.title}</div>
            <NBBadge color={r.type === "link" ? "#A5D6A7" : "#C5E1A5"}>{r.type === "link" ? "enlace" : "archivo"}</NBBadge>
          </a>
          <button onClick={() => del(r.id)} className="nb-border p-2 nb-press bg-[#FF6B6B] text-white" data-testid={`delete-resource-${r.id}`}><Trash2 className="w-4 h-4" /></button>
        </NBCard>
      ))}
    </div>
  );
}

function ActivitiesPanel({ courseId, activities, reload }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("assignment");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(""); const [maxPoints, setMaxPoints] = useState(100); const [xpReward, setXpReward] = useState(50);
  const [questions, setQuestions] = useState([{ question: "", options: ["", "", "", ""], correct_index: 0 }]);

  const addQ = () => setQuestions([...questions, { question: "", options: ["", "", "", ""], correct_index: 0 }]);
  const updateQ = (i, field, val) => { const c = [...questions]; c[i][field] = val; setQuestions(c); };
  const updateOpt = (i, j, val) => { const c = [...questions]; c[i].options[j] = val; setQuestions(c); };
  const reset = () => { setTitle(""); setDescription(""); setDueDate(""); setMaxPoints(100); setXpReward(50); setQuestions([{ question: "", options: ["","","",""], correct_index: 0 }]); setOpen(false); };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { title, description, type, due_date: dueDate || null, max_points: Number(maxPoints), xp_reward: Number(xpReward) };
    if (type === "quiz") payload.quiz_questions = questions.map(q => ({ ...q, correct_index: Number(q.correct_index) }));
    try {
      await api.post(`/courses/${courseId}/activities`, payload);
      toast.success("Activity created"); reset(); reload();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  const del = async (aid) => { if (!window.confirm("Delete?")) return; await api.delete(`/activities/${aid}`); reload(); };

  return (
    <div className="space-y-3">
      {!open && <NBButton variant="dark" onClick={() => setOpen(true)} data-testid="add-activity-btn"><Plus className="inline w-4 h-4 mr-1" /> Add activity</NBButton>}
      {open && (
        <NBCard className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setType("assignment")} className={`flex-1 px-3 py-2 nb-border nb-press ${type === "assignment" ? "bg-[#C5E1A5]" : "bg-white"}`} data-testid="activity-type-assignment">Tarea</button>
              <button type="button" onClick={() => setType("quiz")} className={`flex-1 px-3 py-2 nb-border nb-press ${type === "quiz" ? "bg-[#A5D6A7]" : "bg-white"}`} data-testid="activity-type-quiz">Quiz</button>
            </div>
            <NBInput placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} required data-testid="activity-title-input" />
            <NBTextarea placeholder="Descripción / instrucciones" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} required data-testid="activity-desc-input" />
            <div className="grid grid-cols-3 gap-2">
              <NBInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="activity-due-input" />
              <NBInput type="number" placeholder="Puntos máx." value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} data-testid="activity-maxpoints-input" />
              <NBInput type="number" placeholder="XP recompensa" value={xpReward} onChange={(e) => setXpReward(e.target.value)} data-testid="activity-xp-input" />
            </div>
            {type === "quiz" && (
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <NBCard key={i} color="cream" className="p-3 space-y-2">
                    <NBInput placeholder={`Pregunta ${i + 1}`} value={q.question} onChange={(e) => updateQ(i, "question", e.target.value)} required data-testid={`quiz-q-${i}`} />
                    {q.options.map((o, j) => (
                      <div key={j} className="flex items-center gap-2">
                        <input type="radio" name={`correct_${i}`} checked={q.correct_index === j} onChange={() => updateQ(i, "correct_index", j)} />
                        <NBInput className="flex-1" placeholder={`Opción ${j + 1}`} value={o} onChange={(e) => updateOpt(i, j, e.target.value)} required />
                      </div>
                    ))}
                    <div className="label-caps text-[#3E5A3E]">Selecciona la opción correcta con el radio.</div>
                  </NBCard>
                ))}
                <NBButton type="button" variant="ghost" onClick={addQ} data-testid="quiz-add-q-btn"><Plus className="inline w-4 h-4" /> Agregar pregunta</NBButton>
              </div>
            )}
            <div className="flex gap-2">
              <NBButton type="submit" variant="primary" data-testid="activity-save-btn">Guardar actividad</NBButton>
              <NBButton type="button" variant="ghost" onClick={reset}>Cancelar</NBButton>
            </div>
          </form>
        </NBCard>
      )}
      {activities.map((a) => (
        <NBCard key={a.id} className="p-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex gap-2 items-center flex-wrap"><NBBadge color={a.type === "quiz" ? "#A5D6A7" : "#C5E1A5"}>{a.type === "quiz" ? "quiz" : "tarea"}</NBBadge><NBBadge color="#8BC34A">{a.xp_reward} XP</NBBadge>{a.due_date && <span className="label-caps">Vence {new Date(a.due_date).toLocaleDateString("es-ES")}</span>}</div>
            <div className="font-display font-black mt-1">{a.title}</div>
            <div className="text-sm text-[#4A4A4A]">{a.description}</div>
          </div>
          <button onClick={() => del(a.id)} className="nb-border p-2 nb-press bg-[#FF6B6B] text-white" data-testid={`delete-activity-${a.id}`}><Trash2 className="w-4 h-4" /></button>
        </NBCard>
      ))}
    </div>
  );
}

function SubmissionsPanel({ submissions, reload }) {
  const [grading, setGrading] = useState(null);
  const [score, setScore] = useState(0); const [feedback, setFeedback] = useState("");

  const startGrade = (s) => { setGrading(s); setScore(s.score || 0); setFeedback(s.feedback || ""); };
  const save = async () => {
    await api.post(`/submissions/${grading.id}/grade`, { score: Number(score), feedback });
    toast.success("Calificado — el estudiante ganó XP");
    setGrading(null); reload();
  };

  return (
    <div className="space-y-3">
      {submissions.length === 0 && <NBCard className="p-6 text-sm text-[#3E5A3E]">Aún no hay entregas.</NBCard>}
      {submissions.map((s) => (
        <NBCard key={s.id} className="p-4" data-testid={`submission-${s.id}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex gap-2 items-center flex-wrap">
                <NBBadge color={s.type === "quiz" ? "#A5D6A7" : "#C5E1A5"}>{s.type === "quiz" ? "quiz" : "tarea"}</NBBadge>
                <NBBadge color={s.status === "graded" ? "#2E8B7F" : "#8BC34A"}>{s.status === "graded" ? "calificado" : "enviado"}</NBBadge>
              </div>
              <div className="font-display font-black mt-1">{s.activity_title}</div>
              <div className="text-sm text-[#3E5A3E]">por {s.student_name} · {new Date(s.submitted_at).toLocaleString("es-ES")}</div>
              {s.type === "quiz" && <div className="text-sm mt-1 font-mono">Auto-calificado: {s.correct_count}/{s.total_count} ({s.percent}%)</div>}
              {s.text_response && <div className="text-sm mt-2 p-2 bg-[#F5F1E4] nb-border">{s.text_response}</div>}
              {s.file_id && <a href={`${API}/files/${s.file_id}`} target="_blank" rel="noopener noreferrer" className="label-caps underline mt-2 inline-block">Descargar archivo</a>}
              {s.status === "graded" && <div className="text-sm mt-1">Puntaje: <span className="font-mono font-bold">{s.score}/{s.max_points}</span></div>}
            </div>
            {s.type === "assignment" && (
              <NBButton variant="primary" onClick={() => startGrade(s)} data-testid={`grade-btn-${s.id}`}>{s.status === "graded" ? "Re-calificar" : "Calificar"}</NBButton>
            )}
          </div>
          {grading?.id === s.id && (
            <div className="mt-3 nb-border bg-[#8BC34A] p-3 space-y-2">
              <NBInput type="number" placeholder={`Puntaje / ${s.max_points}`} value={score} onChange={(e) => setScore(e.target.value)} data-testid="grade-score-input" />
              <NBTextarea placeholder="Retroalimentación" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} data-testid="grade-feedback-input" />
              <div className="flex gap-2">
                <NBButton variant="dark" onClick={save} data-testid="grade-save-btn">Guardar calificación</NBButton>
                <NBButton variant="ghost" onClick={() => setGrading(null)}>Cancelar</NBButton>
              </div>
            </div>
          )}
        </NBCard>
      ))}
    </div>
  );
}
