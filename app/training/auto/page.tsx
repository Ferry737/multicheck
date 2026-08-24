"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { composeSession, needsLesson } from "@/lib/coach";
import { composeSubskillQuestions } from "@/lib/coach";
import { Question } from "@/lib/questions";
import { Trainer } from "@/components/Trainer";
import { MicroLesson } from "@/components/MicroLesson";

export default function AutoTraining() {
  const { model, ready } = useLearner();
  const [lessonDone, setLessonDone] = useState(false);
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  // Teach-before-drill: if a concept needs a lesson, show it first
  const plan = composeSession(model);
  const needed = plan.blocks.map((b) => ({ block: b, need: needsLesson(model, b.subskill) }))
    .find((x) => x.need.lesson);
  if (needed && !lessonDone) {
    return <MicroLesson concept={needed.need.concept} onDone={() => setLessonDone(true)} />;
  }

  const qs: Question[] = [];
  for (const b of plan.blocks) qs.push(...composeSubskillQuestions(model, b.subskill, b.count, b.mode));
  // interleave by round so related skills mix (Phase 11)
  const interleaved = interleave(plan.blocks.map((b) => composeSubskillQuestions(model, b.subskill, b.count, b.mode)));

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
