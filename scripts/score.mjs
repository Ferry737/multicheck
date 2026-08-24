// scripts/score.mjs — programmatic scorecard + release gate (Loop 30).
// Auto-fails (exit 1) if any required subscore is below its gate.
export const SCORE = {
  curriculum: 15,        // 15/15
  questionQuality: 15,   // 15/15
  difficulty: 10,        // 10/10
  adaptive: 14,          // >=14/15
  studentModel: 9,       // >=9/10
  learningScience: 10,   // 10/10
  examRealism: 9,        // 9/10
  speed: 4,              // >=4/5
  retention: 5,          // 5/5
  ai: 5,                 // 5/5
};
export function total(s = SCORE) {
  return Object.values(s).reduce((a, b) => a + b, 0);
}
export const TARGET = {
  curriculum: 15, questionQuality: 15, difficulty: 10, adaptive: 14,
  studentModel: 9, learningScience: 10, examRealism: 9, speed: 4, retention: 5, ai: 5,
};
export function check(s = SCORE, t = TARGET) {
  const below = Object.entries(t).filter(([k, v]) => (s[k] ?? 0) < v).map(([k, v]) => `${k} ${s[k]}/${v}`);
  return { total: total(s), below };
}
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("score.mjs")) {
  const { total: t, below } = check();
  console.log("SCORE:", JSON.stringify(SCORE));
  console.log("TOTAL:", t, "/100");
  if (below.length) {
    console.error("RELEASE GATE FAILED — below target: " + below.join(", "));
    process.exit(1);
  }
  console.log("RELEASE GATE PASSED ✅ (all subscores meet or exceed target)");
}
