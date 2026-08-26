// TASK 2 TESTS — memorize-window integrity (memory-exploit loop).
// Amendment matrix: refresh at 25/50/99% of memorizeMs -> remaining time only;
// at >=100% and 150% -> stimulus hidden forever within TTL; tab close/reopen,
// back/forward -> consumed window can never re-render; next-day recurrence
// (> TTL) keeps its legitimate fresh window.
import {
  loadMemWindows, saveMemWindows, planMemWindow, consumeMemWindow, MEMWINDOW_KEY,
} from "/opt/data/projects/multicheck/lib/memwindow.ts";

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log("  ok - " + msg); }
  else { fail++; console.log("  FAIL - " + msg); }
}

const MEM = 4000;        // window under test (ms); % checks are proportional
const START = 1000;      // fixed virtual start time
const TTL = 10 * 60000;

// In-memory stand-in for localStorage; a fresh loadMemWindows() call models a page remount.
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    store: () => m.get(MEMWINDOW_KEY),
  };
}

function firstView(store, qid, memMs) {
  const p = planMemWindow(loadMemWindows(store), qid, START, memMs, TTL);
  saveMemWindows(store, { ...loadMemWindows(store), [qid]: p.entry });
  return p;
}

console.log("[1] fresh view -> full legitimate window");
{
  const s = fakeStorage();
  const p = firstView(s, "q1", MEM);
  ok(p.renderStimulus === true, "first view renders stimulus");
  ok(p.hideAfterMs === MEM, `full window (${p.hideAfterMs}ms == ${MEM}ms)`);
}

console.log("[2] refresh mid-window at 25% / 50% / 99%");
for (const pct of [0.25, 0.5, 0.99]) {
  const s = fakeStorage();
  firstView(s, "q2", MEM);
  const p = planMemWindow(loadMemWindows(s), "q2", START + Math.round(MEM * pct), MEM, TTL);
  ok(p.renderStimulus === true && p.hideAfterMs === Math.round(MEM * (1 - pct)),
    `${Math.round(pct * 100)}% refresh -> remaining ${p.hideAfterMs}ms == expected ${Math.round(MEM * (1 - pct))}ms, not extended`);
}

console.log("[3] expiry boundary: deadline may not be crossed or extended");
{
  const s = fakeStorage();
  firstView(s, "q3", MEM);
  const pBefore = planMemWindow(loadMemWindows(s), "q3", START + MEM - 1, MEM, TTL);
  ok(pBefore.renderStimulus === true && pBefore.hideAfterMs === 1,
    "deadline-1ms -> still showing, exactly 1ms remaining");
  for (const dt of [MEM, MEM + 1]) {
    const p = planMemWindow(loadMemWindows(s), "q3", START + dt, MEM, TTL);
    ok(p.renderStimulus === false && p.entry.consumed === true,
      `t=+${dt}ms (>= deadline) -> hidden AND recorded consumed`);
  }
}

console.log("[4] 150% + far-future within TTL: stays hidden once consumed");
{
  const s = fakeStorage();
  const first = firstView(s, "q4", MEM);
  saveMemWindows(s, { ...loadMemWindows(s), q4: consumeMemWindow(first.entry) });
  for (const dt of [Math.round(MEM * 1.5), 60000, TTL - 1000]) {
    const p = planMemWindow(loadMemWindows(s), "q4", START + dt, MEM, TTL);
    ok(p.renderStimulus === false, `consumed at t=+${dt}ms -> hidden`);
  }
}

console.log("[5] tab close/reopen behaves as remount over persisted state");
{
  const s = fakeStorage();
  firstView(s, "q5", MEM);
  const p = planMemWindow(loadMemWindows(s), "q5", START + 2000, MEM, TTL);
  ok(p.renderStimulus === true && p.hideAfterMs === 2000,
    `reopen mid-window -> remaining only (${p.hideAfterMs}ms)`);
  const p2 = planMemWindow(loadMemWindows(s), "q5", START + 9999, MEM, TTL);
  ok(p2.renderStimulus === false, "reopen past deadline -> hidden");
}

console.log("[6] back/forward cannot resurrect a consumed window");
{
  const s = fakeStorage();
  const first = firstView(s, "q6", MEM);
  saveMemWindows(s, { ...loadMemWindows(s), q6: consumeMemWindow(first.entry) });
  let allHidden = true;
  for (const t of [START + 100, START + 2000, START + 4000, START + 8000, START + 60000]) {
    if (planMemWindow(loadMemWindows(s), "q6", t, MEM, TTL).renderStimulus !== false) allHidden = false;
  }
  ok(allHidden, "all revisits t=+100ms..60s -> never re-renders");
}

console.log("[7] next-day recurrence is NOT suppressed by a stale entry (> TTL)");
{
  const s = fakeStorage();
  firstView(s, "q7", MEM);
  const tomorrow = START + TTL + 60000;
  const p = planMemWindow(loadMemWindows(s), "q7", tomorrow, MEM, TTL);
  ok(p.renderStimulus === true && p.hideAfterMs === MEM,
    "stale entry -> legitimate fresh window next session");
}

console.log("[8] persist round-trip: entries survive storage exactly");
{
  const s = fakeStorage();
  const first = firstView(s, "q8", MEM);
  saveMemWindows(s, { ...loadMemWindows(s), q8: consumeMemWindow(first.entry) });
  const loaded = loadMemWindows(s).q8;
  ok(!!loaded && loaded.startTs === START && loaded.consumed === true,
    "startTs + consumed survive a storage round-trip");
}

console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
if (fail > 0) throw new Error(`MEMWINDOW: ${fail} assertion(s) failed`);
