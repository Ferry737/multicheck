import { generate, GENERATORS } from "/opt/data/projects/multicheck/lib/questions.ts";

const SUBS = Object.keys(GENERATORS);
const N = 5000;

for (const sub of SUBS) {
  const U = GENERATORS[sub].length;
  const perStruct = [];
  for (let si = 0; si < U; si++) {
    const renders = new Set();
    for (let k = 0; k < N; k++) {
      const q = generate(sub, 50, 100000 + si * 1000 + k * 37, si);
      if (!q) break;
      const opts = (q.options ?? []).map(o => String(o).trim()).sort().join("|");
      const stim = (q.stimulus ?? "").trim();
      renders.add(q.prompt.trim() + "||" + opts + "||" + stim);
    }
    perStruct.push(renders.size);
  }
  const sorted = [...perStruct].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = perStruct.reduce((a, b) => a + b, 0) / perStruct.length;
  const fmt = (v) => v >= N - 1 ? `>=${v}` : String(v);
  console.log(`${sub.padEnd(20)} U=${String(U).padStart(3)}  min=${fmt(min).padStart(5)}  median=${fmt(median).padStart(5)}  max=${fmt(max).padStart(5)}  mean=${mean.toFixed(0).padStart(5)}  total=${(U*mean).toFixed(0).padStart(7)}`);
}
