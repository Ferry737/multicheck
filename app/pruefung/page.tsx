"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { AREAS } from "@/lib/curriculum";
import { generateBatch, Question } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { WRITING_MINUTES } from "@/lib/curriculum";

type Mode = null | "standort" | "mini" | "voll";

export default function Pruefung() {
  const { model, ready } = useLearner();
  const [mode, setMode] = useState<Mode>(null);
  const [started, setStarted] = useState(false);

  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  if (mode && !started) {
    const cfg = MODES[mode];
    return (
      <main className="container-x py-10 max-w-xl">
        <h1 className="text-2xl font-bold">{cfg.title}</h1>
        <p className="mt-3 text-ink-muted">{cfg.desc}</p>
        <ul className="mt-4 text-sm text-ink-muted list-disc pl-5 space-y-1">
          {cfg.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <button onClick={() => setStarted(true)} className="mt-6 rounded-xl bg-brand px-6 py-3 text-white font-semibold">Beginnen</button>
        <button onClick={() => { setMode(null); }} className="mt-3 block text-sm text-ink-faint">Zurück</button>
      </main>
    );
  }

  if (mode && started) {
    const cfg = MODES[mode];
    // build mixed question set across all subskills
    const all: Question[] = [];
    for (const a of AREAS) for (const s of a.subskills) {
      if (s.id === "textschreiben") continue;
      all.push(...generateBatch(s.id, 2, cfg.perSub, Date.now() + Math.floor(Math.random() * 1e6)));
    }
    const set = all.slice(0, cfg.total);
    return (
      <Trainer
        title={cfg.title}
        getQuestions={() => set}
        showTimer
        noImmediateFeedback={cfg.noFeedback}
        onDone={() => { setMode(null); setStarted(false); }}
      />
    );
  }

  return (
    <main className="container-x py-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Prüfung</h1>
      <p className="mt-1 text-ink-muted text-sm">Realistische Trainings-Simulationen — keine offiziellen Multicheck-Aufgaben.</p>
      <div className="mt-6 space-y-4">
        {(["standort", "mini", "voll"] as Exclude<Mode, null>[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setStarted(false); }}
            className="w-full rounded-card border border-line bg-paper p-5 shadow-card text-left hover:border-brand">
            <h2 className="font-semibold">{MODES[m].title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{MODES[m].short}</p>
          </button>
        ))}
      </div>
    </main>
  );
}

const MODES: Record<Exclude<Mode, null>, { title: string; short: string; desc: string; points: string[]; total: number; perSub: number; noFeedback: boolean }> = {
  standort: {
    title: "Standortbestimmung", short: "Kurzer Check · ~10 Min.",
    desc: "Bestimme Stärken und Schwächen ohne Erschöpfung.",
    points: ["Ca. 10 Aufgaben über alle Bereiche", "Sofortiges Feedback", "Erstellt danach deinen Plan"], total: 10, perSub: 1, noFeedback: false,
  },
  mini: {
    title: "Mini-Simulation", short: "20–30 Min. · Zeitdruck",
    desc: "Gemischte prüfungsnahe Aufgaben mit echtem Zeitdruck.",
    points: ["Ca. 24 Aufgaben", "Gesamtzeit 25 Min.", "Kein sofortiges Feedback", "Ergebnisbericht danach"], total: 24, perSub: 3, noFeedback: true,
  },
  voll: {
    title: "Vollständige Simulation", short: "Ca. 90 Min. · alle Kategorien",
    desc: "Realistische Praxis-Simulation (nicht offiziell).",
    points: ["Alle Attest-EBA-Kategorien", "Gesamtzeit 90 Min.", "Kein sofortiges Feedback", "Autosave bei Refresh", "Schreibaufgabe 10 Min.", "Ergebnisbericht danach"], total: 60, perSub: 7, noFeedback: true,
  },
};
