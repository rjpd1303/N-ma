import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import Navbar from "../components/Navbar";
import { NBCard, NBBadge } from "../components/nb";
import { Trophy, Crown } from "lucide-react";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => { const { data } = await api.get("/leaderboard"); setRows(data); })(); }, []);

  return (
    <div className="min-h-screen bg-[#F5F1E4] grain">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="leaderboard-page">
        <div className="flex items-end gap-3">
          <Trophy className="w-10 h-10" strokeWidth={2.5} />
          <div>
            <div className="label-caps text-[#3E5A3E]">Top 50 estudiantes</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl uppercase text-[#1F5A2A]">Ranking</h1>
          </div>
        </div>

        {/* Podium */}
        {rows.length > 0 && (
          <div className="grid grid-cols-3 gap-3 items-end">
            <PodiumCard entry={rows[1]} place={2} height="h-36" color="#C5E1A5" />
            <PodiumCard entry={rows[0]} place={1} height="h-48" color="#8BC34A" crown />
            <PodiumCard entry={rows[2]} place={3} height="h-28" color="#A5D6A7" />
          </div>
        )}

        <NBCard className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1F5A2A] text-white">
              <tr className="text-left label-caps">
                <th className="px-4 py-3">Puesto</th>
                <th className="px-4 py-3">Jugador</th>
                <th className="px-4 py-3">Nivel</th>
                <th className="px-4 py-3">Insignias</th>
                <th className="px-4 py-3 text-right">XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t-2 border-[#1F5A2A] ${r.is_me ? "bg-[#8BC34A]" : ""}`} data-testid={`leaderboard-row-${r.rank}`}>
                  <td className="px-4 py-3 font-mono font-bold">#{r.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 nb-border flex items-center justify-center font-display font-black" style={{ background: r.avatar_color }}>{r.name[0]?.toUpperCase()}</div>
                      <span className="font-bold">{r.name}{r.is_me && <NBBadge color="#FF6B6B" className="ml-2">tú</NBBadge>}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">{r.level}</td>
                  <td className="px-4 py-3 font-mono">{r.badge_count}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{r.xp}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[#3E5A3E]">Aún no hay estudiantes.</td></tr>}
            </tbody>
          </table>
        </NBCard>
      </main>
    </div>
  );
}

function PodiumCard({ entry, place, height, color, crown }) {
  if (!entry) return <div className={`${height}`} />;
  return (
    <div className="flex flex-col items-center">
      <div className="w-12 h-12 nb-border flex items-center justify-center font-display font-black text-lg mb-2" style={{ background: entry.avatar_color }}>
        {entry.name[0]?.toUpperCase()}
      </div>
      <div className="font-display font-black text-sm text-center leading-tight mb-2">{entry.name}</div>
      <div className={`w-full ${height} nb-border nb-shadow flex flex-col items-center justify-center`} style={{ background: color }}>
        {crown && <Crown className="w-5 h-5 mb-1" strokeWidth={2.5} />}
        <div className="font-display font-black text-4xl">#{place}</div>
        <div className="font-mono text-xs">{entry.xp} XP</div>
      </div>
    </div>
  );
}
