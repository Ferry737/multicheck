// Verify the live deployment serves 29ea8d9 content: fetch the homepage,
// pull every referenced JS chunk, scan for ASCII-safe literals introduced by
// THIS session's commits (pool widenings + generator fixes).
import { execSync } from "child_process";

const BASE = "https://multicheck-one.vercel.app";
// Markers chosen ASCII-only (umlauts get \u00XX-escaped in minified chunks):
// drop non-ASCII candidates at runtime instead of hardcoding them wrong
function isAscii(s){ return /^[\x20-\x7E]+$/.test(s); }

// Scan every routable page's chunks: lib modules imported only by /pruefung or
// /training land in chunks the homepage never references (memwindow lesson).
let scanned = "";
for (const route of ["/", "/pruefung", "/training", "/fortschritt"]) {
  const html = execSync(`curl -s --max-time 30 "${BASE}${route}"`, {encoding:"utf8", maxBuffer: 20e6});
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map(m => m[0]))];
  console.log(`${route}: ${chunks.length} chunks`);
  let fetched = 0;
  for (const c of chunks) {
    try {
      const js = execSync(`curl -s --max-time 25 "${BASE}${c}"`, {encoding:"utf8", maxBuffer: 30e6});
      scanned += `\n/* ${route} ${c} */\n` + js;
      fetched++;
    } catch { console.log("fetch failed:", c); }
  }
}
var scanned1 = scanned;



const found = [];
for (const s of ["Kartonstapel","Gewinde schneiden","Schreiben lesen","Ader crimpen",
                 "Terminliste","Chargenprotokolle","Auftragserfassung","Zuschnitt",
                 "schwache-bereiche-evidenzgate-v1","multicheck-memwindow-v1","Buchdeckel","Kanarienvogel",
                 "multicheck-memwindow"]) {
  const n = scanned.split(s).length - 1;
  if (n > 0 && isAscii(s)) found.push([s, n]);
}
console.log("\nMARKERS LIVE:");
for (const [s, n] of found) console.log(`  ${String(n).padStart(3)}x  ${s}`);
console.log(found.length >= 3 ? "\nDEPLOY VERIFIED: new content is being served" : "\nNOT YET LIVE or markers absent — do not start the field checklist");
