"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { AREAS } from "@/lib/curriculum";
import { generateBatch, Question } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { recordSimulation } from "@/lib/coach";
import { Card, Button } from "@/components/ui";

type Mode = null | "standort" | "mini" | "voll";

const MODES: Record<Exclude<Mode, null>, { title: string; short: string; desc: string; points: string[]; total: number; perSub: number; noFeedback: boolean }> = {
  standort: { title: "Standortbestimmung", short: "~10 Min.", desc: "Bestimme Stärken und Schwächen ohne Erschöpfung.", points: ["Ca. 10 Aufgaben über alle Bereiche", "Sofortiges Feedback", "Erstellt danach deinen Plan"], total: 10, perSub: 1, noFeedback: false },
  mini: { title: "Mini-Simulation", short: "20–30 Min.", desc: "Gemischte prüfungsnahe Aufgaben mit echtem Zeitdruck.", points: ["Ca. 24 Aufgaben", "Zeit 25 Min.", "Kein sofortiges Feedback", "Ergebnisbericht danach"], total: 24, perSub: 3, noFeedback: true },
  voll: { title: "Vollständige Simulation", short: "Ca. 90 Min.", desc: "Realistische Praxis-Simulation (nicht offiziell).", points: ["Alle Attest-EBA-Kategorien", "Zeit 90 Min.", "Kein sofortiges Feedback", "Autosave bei Refresh", "Schreibaufgabe 10 Min.", "Ergebnisbericht danach"], total: 60, perSub: 7, noFeedback: true },
};

export default function Pruefung() {
  const { model, ready, applySim } = useLearner();
  const [mode, setMode] = useState<Mode>(null);
  const [started, setStarted] = useState(false);
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  if (mode && !started) {
    const cfg = MODES[mode];
    return (
      <Card className="mt-6 p-6 max-w-xl">
        <h1 className="text-xl font-semibold">{cfg.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{cfg.desc}</p>
        <ul className="mt-3 text-sm text-ink-muted list-disc pl-5 space-y-1">{cfg.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => setStarted(true)}>Beginnen</Button>
          <Button variant="secondary" onClick={() => setMode(null)}>Zurück</Button>
        </div>
      </Card>
    );
  }

  if (mode && started) {
    const cfg = MODES[mode];
    const isSim = mode === "mini" || mode === "voll";
    const all: Question[] = [];
    for (const a of AREAS) for (const s of a.subskills) {
      if (s.id === "textschreiben") continue;
      all.push(...generateBatch(s.id, 2, cfg.perSub, Date.now() + Math.floor(Math.random() * 1e6)));
    }
    return <Trainer title={cfg.title} getQuestions={() => all.slice(0, cfg.total)} showTimer noImmediateFeedback={cfg.noFeedback}
      onResults={isSim ? (attempts) => applySim(attempts, mode === "mini" ? "mini-sim" : "full-sim") : undefined}
      onDone={() => { setMode(null); setStarted(false); }} />;
  }

  return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Prüfung</h1>
      <p className="mt-1 text-sm text-ink-muted">Realistische Trainings-Simulationen — keine offiziellen Multicheck-Aufgaben.</p>
      <div className="mt-6 space-y-3 max-w-xl">
        {(["standort", "mini", "voll"] as Exclude<Mode, null>[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setStarted(false); }}
            className="w-full text-left rounded-card border border-line bg-surface p-5 shadow-card hover:border-brand/50 transition-colors">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">{MODES[m].title}</h2>
              <span className="text-xs text-ink-faint">{MODES[m].short}</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{MODES[m].desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
