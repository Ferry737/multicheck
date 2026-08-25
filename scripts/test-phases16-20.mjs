// scripts/test-phases16-20.mjs
import { emptyCoach, updateModel, buildUnseenAssessment, recordUnseen, clampedReadiness, READINESS_CLAMP } from "/opt/data/projects/multicheck/lib/coach.ts";
import { offlineHintFor, offlineSessionSummary } from "/opt/data/projects/multicheck/lib/offlineCoach.ts";
import { generate } from "/opt/data/projects/multicheck/lib/questions.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  FAIL:", m); } };

console.log("[16] unseen assessment + readiness clamp");
{
  let m = emptyCoach();
  // a subskill with high mastery but only 2 attempts / 1 day -> must be clamped
  for (let i = 0; i < 5; i++) m = updateModel(m, [{ subskill: "kopfrechnen", area: "mathematik", ts: Date.now(), correct: true, ms: 1000, difficulty: 80, mode: "adaptive", templateKey: "t" + i }], "s", "adaptive");
  const c = clampedReadiness(m, "kopfrechnen");
  ok(c <= READINESS_CLAMP.ceilingBelow + 1e-9, `clamped readiness ${c.toFixed(2)} <= ${READINESS_CLAMP.ceilingBelow} (insufficient evidence)`);

  // unseen assessment produces fresh, non-repeating items
  const unseen = buildUnseenAssessment(m, 1, 6);
  ok(unseen.length > 0, `unseen items produced: ${unseen.length}`);
  const keys = new Set(unseen.map(q => q.templateKey));
  ok(keys.size === unseen.length, "unseen items have distinct templateKeys");

  const rec = recordUnseen(m, unseen.map(q => ({ subskill: q.subskill, correct: true, ms: 1500 })));
  ok(rec.subs[unseen[0].subskill].unseenPerf > 0, "unseenPerf recorded");
}

console.log("[20] AI-outage offline coach");
{
  const q = generate("textaufgaben", 40, 777);
  const h = offlineHintFor(q, "falsch");
  ok(h.short.length > 0 && h.method.length > 0, "offline hint has short + method");
  const s = offlineSessionSummary(9, 10);
  ok(s.includes("90%") || s.includes("Stark"), "session summary reflects score");
  const s2 = offlineSessionSummary(2, 10);
  ok(s2.length > 0, "low-score summary present");
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
