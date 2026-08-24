"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { masteryOf, statusOf } from "@/lib/learner";
import { AREAS, subskillById } from "@/lib/curriculum";
import { generateBatch } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";

export default function Training() {
  const { model, ready } = useLearner();
  const [active, setActive] = useState<string | null>(null);
  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  if (active) {
    const sk = subskillById(active)!;
    const m = masteryOf(model, active);
    const diff = 1 + Math.round(m * 2);
    return (
      <Trainer
        title={sk.name}
        getQuestions={() => generateBatch(active, diff, 8, Date.now())}
      />
    );
  }

  return (
    <main className="container-x py-8 max-w-3xl">
      <h1 className="text-2xl font-bold">Training</h1>
      <p className="mt-1 text-ink-muted text-sm">Wähle eine Fertigkeit. Der Schwierigkeitsgrad passt sich automatisch an.</p>
      <div className="mt-6 space-y-5">
        {AREAS.map((a) => (
          <section key={a.id}>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{a.group}</h2>
              <span className="text-ink-faint">·</span>
              <h2 className="text-base font-semibold">{a.label}</h2>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              {a.subskills.map((s) => {
                const st = statusOf(model, s.id);
                const m = Math.round(masteryOf(model, s.id) * 100);
                const dot = st === "weak" ? "bg-bad" : st === "normal" ? "bg-amber-400" : "bg-good";
                return (
                  <button key={s.id} onClick={() => setActive(s.id)}
                    className="rounded-card border border-line bg-paper p-4 shadow-card text-left hover:border-brand transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.name}</span>
                      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} title={st} />
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-line overflow-hidden"><div className={`h-full ${st === "weak" ? "bg-bad" : "bg-brand"}`} style={{ width: `${m}%` }} /></div>
                    <p className="mt-1 text-xs text-ink-faint">{m}% · {st === "weak" ? "schwach" : st === "normal" ? "mittel" : "stark"}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
