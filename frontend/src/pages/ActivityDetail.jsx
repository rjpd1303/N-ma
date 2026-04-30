import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, API } from "../lib/api";
import { useAuth } from "../lib/auth";
import Navbar from "../components/Navbar";
import { NBCard, NBButton, NBBadge, NBTextarea } from "../components/nb";
import { Upload, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ActivityDetail() {
  const { id } = useParams();
  const { refreshUser } = useAuth();
  const nav = useNavigate();
  const [a, setA] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const load = async () => {
    const { data } = await api.get(`/activities/${id}`);
    setA(data);
    if (data.type === "quiz") setAnswers(new Array(data.quiz_questions?.length || 0).fill(-1));
    if (data.my_submission) setResult(data.my_submission);
  };
  useEffect(() => { load(); }, [id]);

  const submitAssignment = async (e) => {
    e.preventDefault();
    let file_id = null;
    if (file) {
      setUploading(true);
      const fd = new FormData(); fd.append("file", file);
      try {
        const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        file_id = data.id;
      } catch (e) { setUploading(false); return toast.error("Error al subir"); }
      setUploading(false);
    }
    try {
      const { data } = await api.post(`/activities/${id}/submit-assignment`, { activity_id: id, file_id, text_response: text });
      toast.success("¡Enviado! Esperando calificación.");
      setResult(data);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const submitQuiz = async (e) => {
    e.preventDefault();
    if (answers.some(x => x < 0)) return toast.error("Responde todas las preguntas");
    try {
      const { data } = await api.post(`/activities/${id}/submit-quiz`, { activity_id: id, answers });
      toast.success(`¡${data.percent}% de aciertos! +${data.xp_awarded} XP`);
      setResult(data);
      await refreshUser();
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  if (!a) return <div className="min-h-screen"><Navbar /></div>;

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="activity-page">
        <Link to={`/courses/${a.course_id}`} className="label-caps underline inline-flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Volver al curso</Link>

        <NBCard className="p-6">
          <div className="flex gap-2 flex-wrap items-center">
            <NBBadge color={a.type === "quiz" ? "#A5D6A7" : "#C5E1A5"}>{a.type === "quiz" ? "quiz" : "tarea"}</NBBadge>
            <NBBadge color="#8BC34A">{a.xp_reward} XP</NBBadge>
            {a.due_date && <span className="label-caps">Vence {new Date(a.due_date).toLocaleDateString("es-ES")}</span>}
          </div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase mt-2 leading-tight text-[#1F5A2A]">{a.title}</h1>
          <p className="text-[#3E5A3E] mt-2 whitespace-pre-wrap">{a.description}</p>
        </NBCard>

        {result && (
          <NBCard color="teal" className="p-5" data-testid="activity-result">
            <div className="flex items-center gap-3">
              <Check className="w-7 h-7" strokeWidth={3} />
              <div>
                <div className="font-display font-black text-xl">Entregado</div>
                {result.type === "quiz" && <div className="font-mono text-sm">Puntaje: {result.correct_count}/{result.total_count} ({result.percent}%) · +{result.xp_awarded || 0} XP</div>}
                {result.type === "assignment" && <div className="font-mono text-sm">Estado: {result.status === "graded" ? "calificado" : "enviado"}{result.score != null ? ` · ${result.score}/${a.max_points}` : ""}</div>}
                {result.feedback && <div className="text-sm mt-1">Retroalimentación: {result.feedback}</div>}
              </div>
            </div>
          </NBCard>
        )}

        {!result && a.type === "assignment" && (
          <NBCard className="p-5">
            <h2 className="font-display font-black text-xl uppercase mb-3 text-[#1F5A2A]">Tu entrega</h2>
            <form onSubmit={submitAssignment} className="space-y-3">
              <NBTextarea rows={5} placeholder="Escribe tu respuesta (opcional)" value={text} onChange={(e) => setText(e.target.value)} data-testid="assignment-text-input" />
              <label className="block">
                <div className="label-caps mb-1">Adjuntar archivo (opcional)</div>
                <input type="file" onChange={(e) => setFile(e.target.files[0])} className="w-full nb-border bg-white p-2" data-testid="assignment-file-input" />
              </label>
              <NBButton variant="primary" disabled={uploading} type="submit" data-testid="assignment-submit-btn"><Upload className="inline w-4 h-4 mr-1" /> {uploading ? "Subiendo..." : "Entregar"}</NBButton>
            </form>
          </NBCard>
        )}

        {!result && a.type === "quiz" && (
          <NBCard className="p-5">
            <h2 className="font-display font-black text-xl uppercase mb-3 text-[#1F5A2A]">Quiz</h2>
            <form onSubmit={submitQuiz} className="space-y-4">
              {a.quiz_questions?.map((q, i) => (
                <div key={i} className="nb-border p-3 bg-white" data-testid={`quiz-question-${i}`}>
                  <div className="font-bold mb-2">{i + 1}. {q.question}</div>
                  <div className="space-y-2">
                    {q.options.map((o, j) => (
                      <label key={j} className={`flex items-center gap-2 p-2 nb-border cursor-pointer nb-press ${answers[i] === j ? "bg-[#8BC34A]" : "bg-[#F5F1E4]"}`}>
                        <input type="radio" name={`q_${i}`} checked={answers[i] === j}
                          onChange={() => { const c = [...answers]; c[i] = j; setAnswers(c); }}
                          data-testid={`quiz-option-${i}-${j}`} />
                        <span className="font-medium">{o}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <NBButton variant="primary" type="submit" data-testid="quiz-submit-btn">Enviar quiz</NBButton>
            </form>
          </NBCard>
        )}
      </main>
    </div>
  );
}
