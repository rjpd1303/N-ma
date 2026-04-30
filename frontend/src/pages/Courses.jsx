import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import Navbar from "../components/Navbar";
import { NBCard, NBButton, NBBadge, NBInput, NBTextarea } from "../components/nb";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

const COLORS = ["#8BC34A", "#A5D6A7", "#C5E1A5", "#FF6B6B", "#2E8B7F", "#6B8E23"];

export function Courses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [q, setQ] = useState("");

  const load = async () => {
    const { data } = await api.get("/courses");
    setCourses(data);
  };
  useEffect(() => { load(); }, []);

  const enroll = async (id) => {
    try {
      await api.post(`/courses/${id}/enroll`);
      toast.success("¡Inscrito! +Insignia ganada");
      load();
    } catch (e) { toast.error("No se pudo inscribir"); }
  };

  const filtered = courses.filter(c => c.title.toLowerCase().includes(q.toLowerCase()) || c.subject.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="courses-page">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="label-caps text-[#3E5A3E]">Catálogo</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl uppercase text-[#1F5A2A]">Todos los cursos</h1>
          </div>
          {user?.role === "teacher" && (
            <Link to="/courses/new"><NBButton variant="dark" data-testid="courses-new-btn"><Plus className="w-4 h-4 inline mr-1" /> Nuevo curso</NBButton></Link>
          )}
        </div>

        <NBCard className="p-3 flex items-center gap-2">
          <Search className="w-5 h-5 ml-2" />
          <input placeholder="Buscar cursos..." value={q} onChange={(e) => setQ(e.target.value)}
                 className="flex-1 px-2 py-1.5 font-medium outline-none bg-transparent" data-testid="courses-search-input" />
        </NBCard>

        {filtered.length === 0 ? (
          <NBCard className="p-8 text-center text-[#3E5A3E]">No se encontraron cursos.</NBCard>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <NBCard key={c.id} className="overflow-hidden" data-testid={`courses-card-${c.id}`}>
                <div className="h-24 border-b-2 border-[#1F5A2A] flex items-end p-4" style={{ background: c.cover_color || "#8BC34A" }}>
                  <span className="label-caps">{c.subject}</span>
                </div>
                <div className="p-4 space-y-2">
                  <div className="font-display font-black text-lg leading-tight">{c.title}</div>
                  <p className="text-sm text-[#3E5A3E] line-clamp-2">{c.description}</p>
                  <div className="text-xs text-[#3E5A3E]">por {c.teacher_name} · {c.student_count} estudiantes</div>
                  <div className="flex items-center gap-2 pt-2">
                    <Link to={`/courses/${c.id}`} className="flex-1"><NBButton variant="ghost" className="w-full">Abrir</NBButton></Link>
                    {user?.role === "student" && !c.is_enrolled && (
                      <NBButton variant="primary" onClick={() => enroll(c.id)} data-testid={`courses-enroll-${c.id}`}>Inscribirse</NBButton>
                    )}
                    {c.is_enrolled && <NBBadge color="#2E8B7F">Inscrito</NBBadge>}
                  </div>
                </div>
              </NBCard>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function CourseNew() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [color, setColor] = useState("#8BC34A");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await api.post("/courses", { title, description, subject, cover_color: color });
      toast.success("¡Curso creado!");
      nav(`/courses/${data.id}/manage`);
    } catch (e) { toast.error("Error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="font-display font-black text-4xl uppercase mb-6 text-[#1F5A2A]">Nuevo curso</h1>
        <NBCard className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label-caps block mb-1.5">Título</label>
              <NBInput required value={title} onChange={(e) => setTitle(e.target.value)} data-testid="course-new-title" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Materia</label>
              <NBInput required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Matemáticas, Historia..." data-testid="course-new-subject" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Descripción</label>
              <NBTextarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={4} data-testid="course-new-desc" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Color de portada</label>
              <div className="flex gap-2">
                {COLORS.map((co) => (
                  <button type="button" key={co} onClick={() => setColor(co)}
                    className={`w-10 h-10 nb-border ${color === co ? "nb-shadow -translate-x-0.5 -translate-y-0.5" : ""}`}
                    style={{ background: co }} data-testid={`course-color-${co}`} />
                ))}
              </div>
            </div>
            <NBButton variant="dark" disabled={loading} type="submit" data-testid="course-new-submit">
              {loading ? "Creando..." : "Crear curso"}
            </NBButton>
          </form>
        </NBCard>
      </main>
    </div>
  );
}
