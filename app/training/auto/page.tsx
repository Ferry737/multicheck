"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { buildNextSession, markLessonDone } from "@/lib/orchestrator";
import { composeSubskillQuestions } from "@/lib/coach";
import { Question } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { MicroLesson } from "@/components/MicroLesson";

export default function AutoTraining() {
  const { model, ready, save } = useLearner();
  const [lessonDone, setLessonDone] = useState(false);
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  // One-button autonomy: the orchestrator composes the session deterministically.
  // AI (if available) only personalizes the rationale text — never scores/keys/timers.
  const decision = buildNextSession(model);
  const plan = decision.plan;

  // Teach-before-drill: if a concept needs a lesson, show it first
  const needed = plan.blocks
    .map((b) => ({ block: b, need: decision.interventions.find((x) => x.subskill === b.subskill && x.kind === "lesson") }))
    .find((x) => x.need);
  if (needed && !lessonDone) {
    const concept = needed.need!.concept!;
    return <MicroLesson concept={concept} onDone={(success) => { if (success) save(markLessonDone(model, concept)); setLessonDone(true); }} />;
  }

  // interleave by round so related skills mix (Phase 11)
  const composed = plan.blocks.map((b) => composeSubskillQuestions(model, b.subskill, b.count, b.mode));
  const interleaved = interleave(composed.map((r) => r.questions));

  return (
    <Trainer
      title={plan.title}
      getQuestions={() => interleaved}
      onDone={() => { /* model already updated per attempt */ }}
    />
  );
}

function interleave(groups: Question[][]): Question[] {
  const out: Question[] = [];
  const max = Math.max(...groups.map((g) => g.length));
  for (let i = 0; i < max; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out;
}
