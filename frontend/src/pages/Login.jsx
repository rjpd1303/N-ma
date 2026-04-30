import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NBButton, NBCard, NBInput } from "../components/nb";
import { toast } from "sonner";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_courseforge-69/artifacts/fi0qofox_e5ed343a-cd69-4fa8-8147-0cc3ec580460.jpeg";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const u = await login(email, password);
      toast.success(`¡Bienvenido, ${u.name}!`);
      nav("/dashboard");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-6 nb-press inline-flex" data-testid="login-back-home">
          <img src={LOGO_URL} alt="NUMA" className="w-12 h-12 nb-border nb-shadow-sm object-cover bg-white" />
          <div className="leading-tight">
            <div className="font-display font-black text-2xl text-[#1F5A2A]">NUMA</div>
            <div className="label-caps text-[0.6rem] text-[#3E8E41]">Plantas & Bienestar</div>
          </div>
        </Link>

        <NBCard className="p-8 space-y-5">
          <div>
            <h1 className="font-display font-black text-3xl uppercase text-[#1F5A2A]">Iniciar sesión</h1>
            <p className="text-sm text-[#3E5A3E]">Vuelve a tu camino de aprendizaje.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label-caps block mb-1.5">Correo</label>
              <NBInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                       placeholder="tu@correo.com" data-testid="login-email-input" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Contraseña</label>
              <NBInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                       placeholder="••••••••" data-testid="login-password-input" />
            </div>
            {error && <div className="nb-border bg-[#FF6B6B] text-white px-3 py-2 text-sm font-medium" data-testid="login-error">{error}</div>}
            <NBButton type="submit" variant="dark" className="w-full" disabled={loading} data-testid="login-submit-btn">
              {loading ? "Entrando..." : "Entrar"}
            </NBButton>
          </form>
          <div className="text-sm text-center">
            ¿Sin cuenta? <Link to="/register" className="font-bold underline" data-testid="login-register-link">Crear una</Link>
          </div>
        </NBCard>
      </div>
    </div>
  );
}
