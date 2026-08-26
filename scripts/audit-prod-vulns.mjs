// Parse npm audit JSON and print Critical/High prod vulns with reachability context.
import { execSync } from "child_process";
const raw = execSync("npm audit --omit=dev --json || true", { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const a = JSON.parse(raw);
const rows = [];
for (const [name, v] of Object.entries(a.vulnerabilities || {})) {
  if (v.severity === "critical" || v.severity === "high") {
    const titles = (v.via || []).map((x) => (typeof x === "string" ? x : `${x.title} (CVSS ${x.cvss?.score ?? "?"})`));
    rows.push({ name, severity: v.severity, range: v.range, isDirect: v.isDirect, titles, fixAvailable: v.fixAvailable, nodes: v.nodes });
  }
}
console.log(JSON.stringify(rows, null, 2));
console.log("\nmeta:", JSON.stringify(a.metadata?.vulnerabilities));
