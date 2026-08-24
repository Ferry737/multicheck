"use client";
import Link from "next/link";
import { useLearner } from "@/lib/useLearner";
import { overallReadiness, decideToday, masteryOf, accuracy, avgSpeed } from "@/lib/learner";
import { weeklyPlan } from "@/lib/exam";
import { AREAS, subskillById, EXAM_DATE_DEFAULT } from "@/lib/curriculum";
import { Card, ProgressRing, StatCard, Bar, StatusDot, Button } from "@/components/ui";

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function Heuten() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <Skeleton />;

  const plan = decideToday(model);
  const weekly = weeklyPlan(model);
  const overall = overallReadiness(model);
  const dLeft = daysUntil(model.examDate || EXAM_DATE_DEFAULT.toISOString());
  const studiedMin = Math.round(model.totalStudyMs / 60000);
  const acc = accuracy(model), spd = avgSpeed(model);
  const weakSkills = AREAS.flatMap((a) => a.subskills).filter((s) => masteryOf(model, s.id) < 0.4).slice(0, 3);
  const confLow = AREAS.flatMap((a) => a.subskills).filter((s) => (model.subs[s.id]?.confidence ?? 0) < 0.3).length;

  return (
    <div className="enter">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-ink-muted">Guten Tag 👋</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-0.5">Heute für dich</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tnum">{dLeft}</p>
          <p className="text-2xs text-ink-faint">Tage bis Prüfung</p>
        </div>
      </header>

      {/* ONE dominant AI action */}
      <Card className="mt-6 p-6 bg-brand-soft/50 border-brand/20">
        <p className="text-2xs uppercase tracking-wide text-brand font-medium">KI empfiehlt</p>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h2 className="text-xl font-semibold">{plan.minutes} Minuten Training</h2>
            <p className="text-sm text-ink-muted mt-1 max-w-md">{plan.why}</p>
            <div className="mt-4">
              <Link href="/training/auto"><Button>Heute trainieren →</Button></Link>
            </div>
          </div>
          <ProgressRing value={overall} size={92} label="Bereitschaft" />
        </div>
        {/* session blocks (the AI's plan) */}
        <div className="mt-5 flex flex-wrap gap-2">
          {plan.blocks.map((b, i) => {
            const sk = subskillById(b.subskill);
            return (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-paper border border-line px-3 py-1 text-2xs">
                <span className="font-medium">{sk?.name}</span>
                <span className="text-ink-faint">· {b.count} · {b.mode}</span>
              </span>
            );
          })}
        </div>
      </Card>

      {/* Weekly rolling plan (autopilot default ON) */}
      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <p className="text-2xs uppercase tracking-wide text-ink-faint font-medium">Wochenplan (KI)</p>
          <span className="inline-flex items-center gap-1.5 text-2xs text-good"><StatusDot status="strong" /> Autopilot an</span>
        </div>
        <div className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-ink-muted">Heute</span><span className="font-medium">{weekly.today}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Morgen</span><span>{weekly.tomorrow}</span></div>
          <div className="flex justify-between"><span className="text-ink-muted">Übermorgen</span><span>{weekly.in2}</span></div>
        </div>
        <p className="mt-3 text-2xs text-ink-faint">{weekly.notes.join(" · ")}</p>
      </Card>

      {/* Secondary — decision-useful, restrained */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <StatCard label="Bereitschaft" value={overall + "%"} sub="gesamt" accent={overall >= 60 ? "good" : overall >= 30 ? "warn" : "bad"} />
        <StatCard label="Genauigkeit" value={acc + "%"} sub="letzte Sitzungen" />
        <StatCard label="Ø Tempo" value={spd + "s"} sub="pro Aufgabe" />
        <StatCard label="Gelernt" value={studiedMin + "′"} sub={"🔥 " + model.streakDays + " Tage"} />
      </div>

      {confLow > 0 && (
        <p className="mt-3 text-2xs text-ink-faint">
          Bereitschaft ist bewusst konservativ — {confLow} Bereiche haben noch zu wenig Daten für sichere Aussagen.
        </p>
      )}

      {weakSkills.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink-soft mb-2">Schwache Bereiche</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {weakSkills.map((s) => {
              const a = AREAS.find((x) => x.subskills.some((y) => y.id === s.id))!;
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <StatusDot status="weak" />
                  </div>
                  <p className="text-2xs text-ink-faint mt-0.5">{a.label}</p>
                  <div className="mt-3"><Bar value={masteryOf(model, s.id) * 100} tone="bad" /></div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink-soft mb-2">Bereitschaft nach Bereich</h2>
        <Card className="divide-y divide-line">
          {AREAS.map((a) => {
            const r = Math.round(a.subskills.reduce((s, x) => s + masteryOf(model, x.id), 0) / a.subskills.length * 100);
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{a.label}</span>
                <div className="flex items-center gap-3 w-44">
                  <div className="flex-1"><Bar value={r} /></div>
                  <span className="text-sm font-semibold tnum w-9 text-right">{r}%</span>
                </div>
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-64 rounded-md" />
      <div className="skeleton h-40 rounded-card" />
      <div className="grid grid-cols-4 gap-3"><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /></div>
      <p className="text-center text-sm text-ink-faint">Lade…</p>
    </div>
  );
}
