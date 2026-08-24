"use client";
import Link from "next/link";
import { useLearner } from "@/lib/useLearner";
import { overallReadiness, selectNext, masteryOf, statusOf } from "@/lib/learner";
import { AREAS, subskillById, EXAM_DATE_DEFAULT, DISCLAIMER } from "@/lib/curriculum";

function daysUntil(iso: string) {
  const d = new Date(iso); return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
}

export default function Heute() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  const overall = overallReadiness(model);
  const next = selectNext(model);
  const nextSk = subskillById(next.subskill);
  const dLeft = daysUntil(model.examDate || EXAM_DATE_DEFAULT.toISOString());
  const studiedMin = Math.round(model.totalStudyMs / 60000);
  const status = overall >= 75 ? "🟢 Bereit" : overall >= 50 ? "🟡 Bald bereit" : overall >= 25 ? "🟠 Im Aufbau" : "🔴 Startphase";

  return (
    <main className="container-x py-8 max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-ink-faint text-sm">Heute</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Dein Multicheck® Attest (EBA)</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular">{dLeft}</p>
          <p className="text-xs text-ink-faint">Tage bis Prüfung</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-7">
        <Card title="Bereitschaft">
          <div className="flex items-baseline gap-2"><span className="text-4xl font-bold tabular">{overall}%</span></div>
          <p className="mt-1 text-sm text-ink-muted">{status}</p>
        </Card>
        <Card title="Heute trainieren">
          <p className="text-sm text-ink-muted">{next.reason}</p>
          <Link href="/training" className="mt-2 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">Weiterlernen →</Link>
        </Card>
        <Card title="Diese Woche">
          <p className="text-sm text-ink-muted">{studiedMin} Min. trainiert</p>
          <p className="text-sm text-ink-muted mt-1">🔥 {model.streakDays} Tage Serie</p>
        </Card>
      </div>

      <div className="mt-7 rounded-card border border-line bg-paper p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Schwächste Fertigkeit</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-medium">{nextSk?.name}</span>
          <span className="tabular text-sm text-bad">{Math.round(masteryOf(model, next.subskill) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-bad" style={{ width: `${masteryOf(model, next.subskill) * 100}%` }} /></div>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Bereitschaft nach Bereich</h2>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {AREAS.map((a) => {
          const r = Math.round(a.subskills.reduce((s, x) => s + masteryOf(model, x.id), 0) / a.subskills.length * 100);
          return (
            <div key={a.id} className="rounded-card border border-line bg-paper p-4 shadow-card">
              <div className="flex justify-between"><span className="text-sm font-medium">{a.label}</span><span className="tabular text-sm font-bold">{r}%</span></div>
              <div className="mt-2 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-brand" style={{ width: `${r}%` }} /></div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-paper p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
