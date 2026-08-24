"use client";
import Link from "next/link";
import { useLearner } from "@/lib/useLearner";
import { readinessBySubject, overallReadiness, selectNext } from "@/lib/learner";
import { EXAM_DATE, skillById, SUBJECTS } from "@/lib/curriculum";

function daysUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

export default function Home() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  const overall = overallReadiness(model);
  const bySubj = readinessBySubject(model);
  const next = selectNext(model);
  const nextSkill = skillById(next.skillId);
  const dLeft = daysUntil(EXAM_DATE);

  const status = overall >= 75 ? "🟢 Bereit" : overall >= 50 ? "🟡 Bald bereit" : overall >= 25 ? "🟠 Im Aufbau" : "🔴 Startphase";

  return (
    <main className="container-x py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-ink-faint text-sm">Guten Tag 👋</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Dein Ziel: Multicheck® Attest (EBA)</h1>
        </div>
        <span className="mono text-sm text-ink-muted">{dLeft} Tage bis Prüfung</span>
      </div>

      {/* 3 questions */}
      <div className="grid md:grid-cols-3 gap-4 mt-8">
        <Card title="Wo stehe ich?" >
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular">{overall}%</span>
            <span className="text-ink-muted">Prüfungsbereitschaft</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{status}</p>
        </Card>
        <Card title="Was soll ich jetzt tun?" highlight>
          <p className="text-sm text-ink-muted">{next.reason}</p>
          <Link href="/practice" className="mt-3 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white">
            {nextSkill?.name ?? "Üben"} →
          </Link>
        </Card>
        <Card title="Werde ich besser?">
          <p className="text-sm text-ink-muted">Diese Woche: <span className="text-good font-semibold">+{Math.round(overall * 0.4)}%</span> (Beispiel)</p>
          <div className="mt-3 h-2 rounded-full bg-line overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${overall}%` }} />
          </div>
        </Card>
      </div>

      {/* subjects */}
      <h2 className="mt-10 text-lg font-semibold">Bereitschaft nach Bereich</h2>
      <div className="grid sm:grid-cols-3 gap-4 mt-4">
        {SUBJECTS.map((s) => (
          <div key={s.id} className="rounded-card border border-line bg-paper p-5 shadow-card">
            <div className="flex justify-between items-baseline">
              <span className="font-medium">{s.label}</span>
              <span className="text-xl font-bold tabular">{bySubj[s.id]}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-brand" style={{ width: `${bySubj[s.id]}%` }} />
            </div>
          </div>
        ))}
      </div>

      <nav className="flex flex-wrap gap-3 mt-10">
        <Link href="/practice" className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:border-brand">Üben</Link>
        <Link href="/diagnostic" className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:border-brand">Diagnose</Link>
        <Link href="/exam" className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:border-brand">Prüfungssimulation</Link>
        <Link href="/progress" className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:border-brand">Fortschritt</Link>
        <Link href="/tutor" className="rounded-xl border border-line px-5 py-3 text-sm font-medium hover:border-brand">KI-Nachhilfe</Link>
      </nav>

      <p className="mt-8 text-xs text-ink-faint">
        Hinweis: Lehrplan & Prüfstruktur sind <b>annahmegemäß</b> (allgemeines Wissen EBA), noch nicht offiziell verifiziert. KI-Antworten sind Hilfe, keine Prüfungsfragen.
      </p>
    </main>
  );
}

function Card({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-card border bg-paper p-5 shadow-card ${highlight ? "border-brand/40" : "border-line"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
