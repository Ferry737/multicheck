"use client";
import Link from "next/link";
import { useLearner } from "@/lib/useLearner";
import { overallReadiness, selectNext, masteryOf, accuracy, avgSpeed } from "@/lib/learner";
import { AREAS, subskillById, EXAM_DATE_DEFAULT } from "@/lib/curriculum";
import { Card, ProgressRing, StatCard, Bar, StatusDot, Button } from "@/components/ui";

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function Heute() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <Skeleton/>;

  const overall = overallReadiness(model);
  const next = selectNext(model);
  const nextSk = subskillById(next.subskill);
  const nextArea = AREAS.find((a) => a.subskills.some((s) => s.id === next.subskill));
  const dLeft = daysUntil(model.examDate || EXAM_DATE_DEFAULT.toISOString());
  const studiedMin = Math.round(model.totalStudyMs / 60000);
  const acc = accuracy(model), spd = avgSpeed(model);
  const weakSkills = AREAS.flatMap((a) => a.subskills).filter((s) => masteryOf(model, s.id) < 0.4).slice(0, 3);

  return (
    <div className="enter">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-ink-muted">Guten Tag 👋</p>
          <h1 className="text-2xl font-semibold tracking-tight mt-0.5">Was soll ich heute tun?</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tnum">{dLeft}</p>
          <p className="text-2xs text-ink-faint">Tage bis Prüfung</p>
        </div>
      </header>

      {/* ONE primary area: recommended session */}
      <Card className="mt-6 p-6 bg-brand-soft/40 border-brand/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xs uppercase tracking-wide text-brand font-medium">Empfohlene Einheit</p>
            <h2 className="text-xl font-semibold mt-1">{nextSk?.name}</h2>
            <p className="text-sm text-ink-muted mt-1">{nextArea?.label} · {next.reason}</p>
            <div className="mt-4 flex gap-2">
              <Link href="/training"><Button>Weiterlernen →</Button></Link>
              <Link href="/training"><Button variant="secondary">Training wählen</Button></Link>
            </div>
          </div>
          <ProgressRing value={Math.round(masteryOf(model, next.subskill) * 100)} size={92} label="Bereitschaft" />
        </div>
      </Card>

      {/* Secondary metrics — restrained, decision-useful */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <StatCard label="Bereitschaft" value={overall + "%"} sub="gesamt" accent={overall >= 60 ? "good" : overall >= 30 ? "warn" : "bad"} />
        <StatCard label="Genauigkeit" value={acc + "%"} sub="letzte Sitzungen" />
        <StatCard label="Ø Tempo" value={spd + "s"} sub="pro Aufgabe" />
        <StatCard label="Diese Woche" value={studiedMin + "′"} sub={"🔥 " + model.streakDays + " Tage"} />
      </div>

      {/* Weak areas */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink-soft mb-2">Schwache Bereiche</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {weakSkills.length === 0 && <p className="text-sm text-ink-muted">Keine schwachen Bereiche — stark! 🎉</p>}
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

      {/* Readiness by area (compact) */}
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
      <div className="skeleton h-32 rounded-card" />
      <div className="grid grid-cols-4 gap-3"><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /><div className="skeleton h-20 rounded-card" /></div>
      <p className="text-center text-sm text-ink-faint">Lade…</p>
    </div>
  );
}
