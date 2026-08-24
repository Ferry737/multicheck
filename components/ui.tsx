"use client";
import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface shadow-card ${className}`}>{children}</div>;
}

export function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "brand" | "good" | "bad" | "warn" }) {
  const c = accent === "good" ? "text-good" : accent === "bad" ? "text-bad" : accent === "warn" ? "text-warn" : "text-ink";
  return (
    <Card className="p-4">
      <p className="text-2xs uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tnum ${c}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </Card>
  );
}

export function ProgressRing({ value, size = 96, stroke = 8, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const off = c * (1 - value / 100);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7E5E0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2C5FE0" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 400ms ease" }} />
      </svg>
      <div className="absolute text-center">
        <span className="text-xl font-bold tnum">{value}%</span>
        {label && <p className="text-2xs text-ink-faint">{label}</p>}
      </div>
    </div>
  );
}

export function Bar({ value, tone = "brand" }: { value: number; tone?: "brand" | "good" | "bad" | "warn" }) {
  const bg = tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-brand";
  return (
    <div className="h-1.5 rounded-full bg-line overflow-hidden">
      <div className={`h-full ${bg}`} style={{ width: `${Math.max(0, Math.min(100, value))}%`, transition: "width 400ms ease" }} />
    </div>
  );
}

export function StatusDot({ status }: { status: "weak" | "normal" | "strong" }) {
  const c = status === "weak" ? "bg-bad" : status === "normal" ? "bg-warn" : "bg-good";
  const t = status === "weak" ? "schwach" : status === "normal" ? "mittel" : "stark";
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><span className={`h-2 w-2 rounded-full ${c}`} />{t}</span>;
}

export function Button({ children, onClick, variant = "primary", disabled, className = "", type = "button" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  const v = variant === "primary" ? "bg-brand text-white hover:bg-brand-deep"
    : variant === "secondary" ? "border border-line bg-paper text-ink-soft hover:border-lineStrong"
    : "text-ink-muted hover:text-ink";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${v} ${className}`}>
      {children}
    </button>
  );
}
