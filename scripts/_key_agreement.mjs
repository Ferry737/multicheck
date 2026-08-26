// Key-agreement test: engine's promptHash and audit's normExact MUST agree on 1000 items.
import { generate } from "/opt/data/projects/multicheck/lib/questions.ts";
import crypto from "crypto";

function engineHash(q) {
  const opts = (q.options || []).map(o => String(o).trim()).sort();
  const stim = (q.stimulus ?? "").trim();
  return "p:" + crypto.createHash("sha1").update(JSON.stringify([q.prompt.trim(), opts, stim])).digest("hex");
}
function auditHash(q) {
  const opts = (q.options || []).map(o => String(o).trim()).sort();
  const stim = (q.stimulus ?? "").trim();
  return crypto.createHash("sha1").update(JSON.stringify([q.prompt.trim(), opts, stim])).digest("hex");
}

let agree = 0, total = 0;
for (let i = 0; i < 1000; i++) {
  const sub = ["bilder_zaehlen", "symbole_entdecken", "schilder_erinnern"][i % 3];
  const q = generate(sub, 50, 70000 + i * 131, i % 4);
  if (!q) continue;
  total++;
  // strip the "p:" prefix from engine hash — it's a namespace tag, not part of the payload
  if (engineHash(q).slice(2) === auditHash(q)) agree++;
}
console.log(`KEY AGREEMENT: ${agree}/${total} = ${(agree/total*100).toFixed(1)}%`);
if (agree !== total) throw new Error("ENGINE/AUDIT KEY MISMATCH");
