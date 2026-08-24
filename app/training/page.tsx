"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { masteryOf, statusOf } from "@/lib/learner";
import { AREAS, subskillById } from "@/lib/curriculum";
import { generateBatch } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { Card, Bar, StatusDot, Button } from "@/components/ui";

const ICONS: Record<string, string> = {
  deutsch: "🗣", mathematik: "∑", logik: "◇", konzentration: "◉", merkfaehigkeit: "◎", praktisch: "▤", textschreiben: "✎",
};
type Diff = "adaptiv" | "leicht" | "mittel" | "schwer";

export default function Training() {
  const { model, ready } = useLearner();
  const [active, setActive] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ count: number; diff: Diff; onlyErrors: boolean }>({ count: 10, diff: "adaptiv", onlyErrors: false });

  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  if (active) {
    const sk = subskillById(active)!;
    const m = masteryOf(model, active);
    const diff = setup.diff === "adaptiv" ? 1 + Math.round(m * 2) : setup.diff === "leicht" ? 1 : setup.diff === "mittel" ? 2 : 3;
    return <Trainer title={sk.name} getQuestions={() => generateBatch(active, diff, setup.count, Date.now())} />;
  }

  return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
      <p className="mt-1 text-sm text-ink-muted">Wähle eine Fertigkeit. Der Schwierigkeitsgrad passt sich automatisch an.</p>

      <div className="mt-6 space-y-5">
        {AREAS.map((a) => (
          <section key={a.id}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{ICONS[a.id]}</span>
              <h2 className="text-sm font-semibold text-ink-soft">{a.label}</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {a.subskills.map((s) => {
                const st = statusOf(model, s.id);
                const m = Math.round(masteryOf(model, s.id) * 100);
                return (
                  <button key={s.id} onClick={() => setActive(s.id)}
                    className="text-left rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{s.name}</span>
                      <StatusDot status={st} />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1"><Bar value={m} tone={st === "weak" ? "bad" : "brand"} /></div>
                      <span className="text-xs font-semibold tnum w-9 text-right">{m}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
