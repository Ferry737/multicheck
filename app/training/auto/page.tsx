"use client";
import { useLearner } from "@/lib/useLearner";
import { composeSession } from "@/lib/learner";
import { composeSubskillQuestions } from "@/lib/coach";
import { Question } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";

export default function AutoTraining() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  const plan = composeSession(model);
  const qs: Question[] = [];
  for (const b of plan.blocks) {
    qs.push(...composeSubskillQuestions(model, b.subskill, b.count, b.mode));
  }
  // interleave by round so related skills mix (Phase 11)
  const interleaved = interleave(plan.blocks.map((b) => composeSubskillQuestions(model, b.subskill, b.count, b.mode)));

  return (
    <Trainer
      title={plan.title}
      getQuestions={() => interleaved}
      onDone={() => { /* model already updated per attempt; could route to results */ }}
    />
  );
}

function interleave(groups: Question[][]): Question[] {
  const out: Question[] = [];
  const max = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < max; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out;
}
