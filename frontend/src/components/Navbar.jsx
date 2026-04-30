import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LogOut, Trophy, User, LayoutDashboard, BookOpen } from "lucide-react";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_courseforge-69/artifacts/fi0qofox_e5ed343a-cd69-4fa8-8147-0cc3ec580460.jpeg";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  if (!user || user === false) return null;

  const isActive = (p) => loc.pathname === p;
  const linkBase = "px-3 py-1.5 nb-border bg-white text-sm font-bold nb-press";
  const activeCls = "bg-[#8BC34A]";

  return (
    <header className="sticky top-0 z-40 bg-[#F5F1E4] border-b-2 border-[#1F5A2A]" data-testid="main-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 nb-press" data-testid="nav-logo">
          <img src={LOGO_URL} alt="NUMA" className="w-11 h-11 nb-border object-cover bg-white" />
          <span className="font-display font-black text-xl tracking-tight text-[#1F5A2A]">NUMA</span>
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          <Link to="/dashboard" className={`${linkBase} ${isActive("/dashboard") ? activeCls : ""}`} data-testid="nav-dashboard">
            <LayoutDashboard className="w-4 h-4 inline mr-1" /> Panel
          </Link>
          <Link to="/courses" className={`${linkBase} ${isActive("/courses") ? activeCls : ""}`} data-testid="nav-courses">
            <BookOpen className="w-4 h-4 inline mr-1" /> Cursos
          </Link>
          <Link to="/leaderboard" className={`${linkBase} ${isActive("/leaderboard") ? activeCls : ""}`} data-testid="nav-leaderboard">
            <Trophy className="w-4 h-4 inline mr-1" /> Ranking
          </Link>
          <Link to="/profile" className={`${linkBase} ${isActive("/profile") ? activeCls : ""}`} data-testid="nav-profile">
            <User className="w-4 h-4 inline mr-1" /> Perfil
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#A5D6A7] nb-border">
            <span className="font-mono text-xs font-bold" data-testid="nav-xp">{user.xp} XP</span>
            <span className="w-px h-4 bg-[#1F5A2A]" />
            <span className="font-mono text-xs font-bold" data-testid="nav-level">NV {user.level}</span>
          </div>
          <button
            onClick={async () => { await logout(); nav("/login"); }}
            className="px-3 py-1.5 bg-white nb-border nb-press text-sm font-bold flex items-center gap-1"
            data-testid="nav-logout-btn"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </div>
    </header>
  );
}
