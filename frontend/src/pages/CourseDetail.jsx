import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, API } from "../lib/api";
import { useAuth } from "../lib/auth";
import Navbar from "../components/Navbar";
import { NBCard, NBButton, NBBadge } from "../components/nb";
import ReactMarkdown from "react-markdown";
import { FileText, LinkIcon, BookOpen, ClipboardList, CheckCircle2, Clock, ArrowRight, Pencil, Download, HardDriveDownload, Check } from "lucide-react";
import { toast } from "sonner";
import { markCourseOffline, isCourseOffline, markFileOffline, isFileOffline, precacheFile } from "../lib/offline";

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState("lessons");
  const [lessons, setLessons] = useState([]);
  const [resources, setResources] = useState([]);
  const [activities, setActivities] = useState([]);
  const [offline, setOffline] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [offlineFiles, setOfflineFiles] = useState({});

  const load = useCallback(async () => {
    const { data: c } = await api.get(`/courses/${id}`);
    setCourse(c);
    const [ls, rs, as] = await Promise.all([
      api.get(`/courses/${id}/lessons`),
      api.get(`/courses/${id}/resources`),
      api.get(`/courses/${id}/activities`),
    ]);
    setLessons(ls.data); setResources(rs.data); setActivities(as.data);
    setOffline(await isCourseOffline(id));
    const fmap = {};
    for (const r of rs.data) {
      if (r.type === "file" && r.file_id) fmap[r.file_id] = await isFileOffline(r.file_id);
    }
    setOfflineFiles(fmap);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const downloadCourseOffline = async () => {
    setDownloading(true);
    try {
      // Pre-cache lessons + resources + activities (already cached by api interceptor)
      // Pre-cache file resources via service worker
      for (const r of resources) {
        if (r.type === "file" && r.file_id) {
          const url = `${API}/files/${r.file_id}`;
          precacheFile(url);
          await markFileOffline(r.file_id, { title: r.title, course_id: id });
        }
      }
      await markCourseOffline(id, { title: course.title, subject: course.subject });
      setOffline(true);
      const fmap = { ...offlineFiles };
      for (const r of resources) if (r.type === "file" && r.file_id) fmap[r.file_id] = true;
      setOfflineFiles(fmap);
      toast.success("Curso disponible sin conexión");
    } catch (e) {
      toast.error("No se pudo descargar el curso");
    } finally {
      setDownloading(false);
    }
  };

  const downloadResource = async (r) => {
    if (r.type !== "file" || !r.file_id) return;
    precacheFile(`${API}/files/${r.file_id}`);
    await markFileOffline(r.file_id, { title: r.title, course_id: id });
    setOfflineFiles({ ...offlineFiles, [r.file_id]: true });
    toast.success(`"${r.title}" guardado sin conexión`);
  };

  const enroll = async () => {
    await api.post(`/courses/${id}/enroll`);
    toast.success("¡Inscrito!");
    load();
  };

  if (!course) return <div className="min-h-screen"><Navbar /></div>;

  const tabs = [
    { id: "lessons", label: "Lessons", icon: BookOpen, count: lessons.length },
    { id: "resources", label: "Resources", icon: FileText, count: resources.length },
    { id: "activities", label: "Activities", icon: ClipboardList, count: activities.length },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="course-detail">
        {/* Header */}
        <NBCard className="overflow-hidden">
          <div className="h-32 border-b-2 border-[#1F5A2A] flex items-end p-6" style={{ background: course.cover_color || "#8BC34A" }}>
            <div>
              <NBBadge>{course.subject}</NBBadge>
              <h1 className="font-display font-black text-4xl sm:text-5xl uppercase mt-2 leading-[0.95]">{course.title}</h1>
            </div>
          </div>
          <div className="p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[#3E5A3E]">{course.description}</p>
              <div className="label-caps mt-3">Por {course.teacher_name} · {course.student_count} estudiantes</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {course.is_owner && (
                <Link to={`/courses/${id}/manage`}>
                  <NBButton variant="dark" data-testid="course-manage-btn"><Pencil className="inline w-4 h-4 mr-1" /> Administrar</NBButton>
                </Link>
              )}
              {user?.role === "student" && !course.is_enrolled && (
                <NBButton variant="primary" onClick={enroll} data-testid="course-enroll-btn">Inscribirse <ArrowRight className="inline w-4 h-4 ml-1" /></NBButton>
              )}
              {course.is_enrolled && <NBBadge color="#2E8B7F">Inscrito</NBBadge>}
              {course.is_enrolled && (
                offline ? (
                  <NBBadge color="#A5D6A7" className="flex items-center gap-1"><Check className="w-3 h-3" /> Offline listo</NBBadge>
                ) : (
                  <NBButton variant="teal" onClick={downloadCourseOffline} disabled={downloading} data-testid="course-download-offline-btn">
                    <HardDriveDownload className="inline w-4 h-4 mr-1" /> {downloading ? "Descargando..." : "Descargar para offline"}
                  </NBButton>
                )
              )}
            </div>
          </div>
        </NBCard>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 nb-border nb-press font-bold text-sm uppercase tracking-wider ${tab === t.id ? "bg-[#8BC34A] nb-shadow" : "bg-white"}`}
              data-testid={`course-tab-${t.id}`}>
              <t.icon className="w-4 h-4 inline mr-1" /> {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "lessons" && (
          <div className="space-y-3">
            {lessons.length === 0 ? <Empty text="Aún no hay lecciones." /> :
              lessons.map((l) => (
                <NBCard key={l.id} className="p-5" data-testid={`lesson-${l.id}`}>
                  <div className="font-display font-black text-xl text-[#1F5A2A]">{l.title}</div>
                  <div className="mt-2 prose prose-sm max-w-none prose-headings:font-display prose-headings:text-[#1F5A2A] prose-strong:text-[#1F5A2A] prose-a:text-[#2E8B7F]">
                    <ReactMarkdown>{l.content}</ReactMarkdown>
                  </div>
                </NBCard>
              ))}
          </div>
        )}

        {tab === "resources" && (
          <div className="grid sm:grid-cols-2 gap-3">
            {resources.length === 0 ? <Empty text="Aún no hay recursos." /> :
              resources.map((r) => (
                <NBCard key={r.id} className="p-4 flex items-start gap-3" data-testid={`resource-${r.id}`}>
                  <div className="w-10 h-10 nb-border flex items-center justify-center flex-shrink-0" style={{ background: r.type === "link" ? "#A5D6A7" : "#C5E1A5" }}>
                    {r.type === "link" ? <LinkIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <a href={r.type === "link" ? r.url : `${API}/files/${r.file_id}`} target="_blank" rel="noopener noreferrer" className="block">
                      <div className="font-bold truncate">{r.title}</div>
                      {r.description && <div className="text-sm text-[#3E5A3E]">{r.description}</div>}
                    </a>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <NBBadge color={r.type === "link" ? "#A5D6A7" : "#C5E1A5"}>{r.type === "link" ? "enlace" : "archivo"}</NBBadge>
                      {r.type === "file" && r.file_id && (
                        offlineFiles[r.file_id] ? (
                          <NBBadge color="#8BC34A" className="flex items-center gap-1"><Check className="w-3 h-3" /> Offline</NBBadge>
                        ) : (
                          <button onClick={() => downloadResource(r)} className="label-caps underline" data-testid={`resource-download-${r.id}`}>
                            <Download className="w-3 h-3 inline" /> Guardar offline
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </NBCard>
              ))}
          </div>
        )}

        {tab === "activities" && (
          <div className="space-y-3">
            {activities.length === 0 ? <Empty text="Aún no hay actividades." /> :
              activities.map((a) => (
                <NBCard key={a.id} className="p-5 flex items-start justify-between gap-4" data-testid={`activity-${a.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <NBBadge color={a.type === "quiz" ? "#A5D6A7" : "#C5E1A5"}>{a.type === "quiz" ? "quiz" : "tarea"}</NBBadge>
                      {a.due_date && <span className="label-caps"><Clock className="w-3 h-3 inline" /> Vence {new Date(a.due_date).toLocaleDateString("es-ES")}</span>}
                      <NBBadge color="#8BC34A">{a.xp_reward} XP</NBBadge>
                    </div>
                    <div className="font-display font-black text-xl mt-1">{a.title}</div>
                    <div className="text-sm text-[#3E5A3E] mt-1">{a.description}</div>
                    {a.my_submission && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-[#2E8B7F]" />
                        <span className="font-bold">Entregado</span>
                        {a.my_submission.status === "graded" && <span className="font-mono">· Puntaje {a.my_submission.score}/{a.max_points}</span>}
                      </div>
                    )}
                  </div>
                  {user?.role === "student" && course.is_enrolled && (
                    <Link to={`/activities/${a.id}`}>
                      <NBButton variant={a.my_submission ? "ghost" : "primary"} data-testid={`activity-open-${a.id}`}>
                        {a.my_submission ? "Ver" : "Comenzar"}
                      </NBButton>
                    </Link>
                  )}
                </NBCard>
              ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Empty({ text }) {
  return <NBCard className="p-6 text-center text-[#4A4A4A]">{text}</NBCard>;
}
