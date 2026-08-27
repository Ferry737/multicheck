// Phase 10-12: INTERNAL ADAPTIVE-MODEL CALIBRATION.
// NOT psychometric calibration against a real Multicheck population — no such data
// exists here. This measures whether the coach's OWN predicted P(correct) matches
// observed outcomes for synthetic learners with a known latent ability.
//
// The predictor under test is the shipped one in lib/coach.ts (updateModel):
//     predP = 1 / (1 + exp(-(ability - itemDifficulty) / 18))
// with ability driven online by k=6 Elo-style updates. We drive real attempts
// through updateModel() so the ability trajectory is the production trajectory,
// and we score the model's prediction BEFORE each outcome is revealed.
import { emptyCoach, updateModel } from "../lib/coach.ts";
import { generateBatch, GENERATORS } from "../lib/questions.ts";

const SUBS = Object.keys(GENERATORS);
const PROFILES = [
  { name: "very weak", trueAbility: 15 },
  { name: "weak", trueAbility: 32 },
  { name: "average", trueAbility: 50 },
  { name: "strong", trueAbility: 72 },
  { name: "very strong", trueAbility: 90 },
  { name: "slow accurate", trueAbility: 68 },
  { name: "fast careless", trueAbility: 38 },
  { name: "poor retention", trueAbility: 45 },
  { name: "practice-strong/exam-weak", trueAbility: 60 },
];

let seed = 20260826;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const logistic = (a, d) => 1 / (1 + Math.exp(-(a - d) / 18));

const rows = [];
for (const prof of PROFILES) {
  for (const sub of SUBS) {
    let m = emptyCoach();
    // Ability starts at 30 (emptySub) and moves with k=6, so the first ~20 attempts
    // measure cold-start LAG, not miscalibration. We run a warm-up phase whose
    // predictions are NOT scored, then score the converged regime. Both phases are
    // reported so the cold-start cost stays visible instead of being hidden.
    const WARMUP_ROUNDS = 12;
    for (let w = 0; w < WARMUP_ROUNDS; w++) {
      const reqDiff = [20, 35, 50, 65, 80][w % 5];
      const items = generateBatch(sub, reqDiff, 4, Math.floor(rnd() * 1e9));
      const attempts = items.map((q) => {
        const trueP = logistic(prof.trueAbility, reqDiff);
        const correct = rnd() < trueP;
        return { subskill: sub, area: "x", ts: Date.now() + w * 86400000, correct,
          ms: correct ? 9000 : 15000, difficulty: reqDiff, mode: "training", unseen: true, exactHash: q.exactHash };
      });
      m = updateModel(m, attempts, `warm-${prof.name}-${sub}-${w}`, "training");
    }
    // Items are HELD OUT: freshly generated per learner, never seen before.
    for (const reqDiff of [20, 35, 50, 65, 80]) {
      const items = generateBatch(sub, reqDiff, 4, Math.floor(rnd() * 1e9));
      const attempts = [];
      for (const q of items) {
        const st = m.subs[sub];
        const ability = st ? st.difficulty : 50;
        const itemDiff = reqDiff;
        // model's prediction, recorded BEFORE the outcome exists
        const predicted = logistic(ability, itemDiff);
        // independent ground truth: the learner's real ability vs the same item
        const trueP = logistic(prof.trueAbility, itemDiff);
        const correct = rnd() < trueP;
        rows.push({ predicted, observed: correct ? 1 : 0, sub, prof: prof.name, reqDiff });
        attempts.push({ subskill: sub, area: "x", ts: Date.now() + 99 * 86400000, correct,
          ms: correct ? 9000 : 15000, difficulty: itemDiff, mode: "training", unseen: true, exactHash: q.exactHash });
      }
      m = updateModel(m, attempts, "calib-" + prof.name + "-" + sub + "-" + reqDiff, "training");
    }
  }
}

const BINS = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, sp: 0, so: 0 }));
for (const r of rows) {
  const idx = Math.min(9, Math.max(0, Math.floor(r.predicted * 10)));
  BINS[idx].n++; BINS[idx].sp += r.predicted; BINS[idx].so += r.observed;
}

console.log(`INTERNAL ADAPTIVE-MODEL CALIBRATION`);
console.log(`${rows.length} held-out attempts | ${PROFILES.length} synthetic learners | ${SUBS.length} subskills`);
console.log(`predictor under test: predP = 1/(1+exp(-(ability - itemDiff)/18)), k=6 online update\n`);
console.log("bin         n   predMean   obsMean   absErr");
let wmae = 0, over = 0, under = 0, worst = { err: 0, label: "-" };
for (const b of BINS) {
  const label = `${(b.lo * 100).toFixed(0).padStart(3)}-${(b.hi * 100).toFixed(0).padStart(3)}%`;
  if (!b.n) { console.log(`${label}    0          -         -       -`); continue; }
  const pm = b.sp / b.n, om = b.so / b.n, err = Math.abs(pm - om);
  wmae += err * b.n;
  if (pm > om) over += (pm - om) * b.n; else under += (om - pm) * b.n;
  if (err > worst.err) worst = { err, label: `${label} n=${b.n} pred ${(pm * 100).toFixed(1)}% vs obs ${(om * 100).toFixed(1)}%` };
  console.log(`${label} ${String(b.n).padStart(4)}   ${(pm * 100).toFixed(1).padStart(7)}%  ${(om * 100).toFixed(1).padStart(7)}%  ${(err * 100).toFixed(1).padStart(6)}%`);
}
wmae /= rows.length; over /= rows.length; under /= rows.length;
console.log(`\nweighted MAE:         ${(wmae * 100).toFixed(2)}%`);
console.log(`overconfidence bias:  ${(over * 100).toFixed(2)}%`);
console.log(`underconfidence bias: ${(under * 100).toFixed(2)}%`);
console.log(`worst bin:            ${worst.label}`);
const OK = wmae < 0.12;
console.log(`\n${OK ? "PASS" : "FAIL"} — internal calibration ${OK ? "within" : "OUTSIDE"} the 12% weighted-MAE tolerance.`);
console.log("NOTE: internal model calibration only; not calibrated against real Multicheck population data.");
if (!OK) process.exit(1);
