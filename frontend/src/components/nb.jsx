import React from "react";

export function NBCard({ children, className = "", color = "white", ...props }) {
  const bg = { white: "bg-white", yellow: "bg-[#8BC34A]", purple: "bg-[#A5D6A7]",
               teal: "bg-[#C5E1A5]", red: "bg-[#FF6B6B]", cream: "bg-[#F5F1E4]" }[color] || color;
  return (
    <div className={`${bg} nb-border nb-shadow ${className}`} {...props}>
      {children}
    </div>
  );
}

export function NBButton({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-[#8BC34A] text-[#1F5A2A]",
    dark: "bg-[#1F5A2A] text-white",
    purple: "bg-[#A5D6A7] text-[#1F5A2A]",
    teal: "bg-[#C5E1A5] text-[#1F5A2A]",
    danger: "bg-[#FF6B6B] text-white",
    ghost: "bg-white text-[#1F5A2A]",
  };
  return (
    <button
      className={`${variants[variant]} nb-border nb-shadow nb-press px-5 py-2.5 font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function NBBadge({ children, color = "#8BC34A", className = "" }) {
  return (
    <span className={`inline-block px-2 py-0.5 nb-border text-xs font-bold uppercase tracking-wider ${className}`} style={{ background: color }}>
      {children}
    </span>
  );
}

export function NBInput(props) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2.5 nb-border bg-white font-medium focus:outline-none focus:nb-shadow focus:-translate-x-0.5 focus:-translate-y-0.5 transition-all ${props.className || ""}`}
    />
  );
}

export function NBTextarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full px-4 py-2.5 nb-border bg-white font-medium focus:outline-none focus:nb-shadow focus:-translate-x-0.5 focus:-translate-y-0.5 transition-all ${props.className || ""}`}
    />
  );
}

export function NBProgress({ value = 0, color = "#A5D6A7" }) {
  return (
    <div className="w-full h-5 nb-border bg-white overflow-hidden relative">
      <div className="h-full transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color, borderRight: value > 0 && value < 100 ? "2px solid #0A0A0A" : "none" }} />
      <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xs">{value}%</div>
    </div>
  );
}
