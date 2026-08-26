// TASK 2 (memory-exploit loop): memorize-window integrity.
//
// EXPLOIT BEING CLOSED (P0 by this project's severity scale — timer exploit AND
// invalid memory task): the training renderer kept the memorize window in plain
// component state, so a refresh re-mounted with a FULL fresh window — a student
// could re-memorize indefinitely. The exam renderer showed the remaining time
// correctly but kept the stimulus VISIBLE forever after expiry until the click.
//
// DESIGN: absolute-deadline pattern, proven for the exam timer (lib/exam.ts)
// and Textschreiben drafts. Pure functions here; renderers stay thin.
//
// TRAINING MODE: recall items RECURRE across days (spaced repetition), so a
// consumption record must NOT suppress the window in tomorrow's legitimate
// session. Entries therefore carry a freshness TTL: within TTL the window is
// active-or-consumed (refresh cannot extend it); after TTL the entry is stale
// and the next real session gets a legitimate fresh window.
//
// EXAM MODE: strictness comes from the snapshot flag (memorizePhaseEnded) plus
// these helpers; pass a TTL covering the whole exam duration.

export interface MemWindowEntry {
  startTs: number;    // first render of this window
  deadline: number;   // absolute: startTs + memorizeMs
  consumed: boolean;  // window over; stimulus must never render again
}

export const MEMWINDOW_KEY = "multicheck-memwindow-v1";

/**
 * How long a window record stays authoritative. Within TTL the window is
 * active-or-consumed (refresh cannot extend or revive it). After TTL the entry
 * goes stale so RECALL RECURRENCE across days gets a legitimate fresh window
 * (spaced repetition re-presents the item as a new task). One week exceeds any
 * single session by orders of magnitude while staying well under the daily
 * recurrence interval chain — an entry older than a week cannot protect anything
 * meaningful anyway.
 */
export const MEMWINDOW_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MemStorage = Pick<Storage, "getItem" | "setItem">;

export function loadMemWindows(storage: MemStorage | null | undefined): Record<string, MemWindowEntry> {
  try {
    const raw = storage?.getItem(MEMWINDOW_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === "object" ? p as Record<string, MemWindowEntry> : {};
  } catch { return {}; }
}

export function saveMemWindows(storage: MemStorage | null | undefined, all: Record<string, MemWindowEntry>): void {
  try { storage?.setItem(MEMWINDOW_KEY, JSON.stringify(all)); } catch { /* quota/private mode */ }
}

export interface MemWindowPlan {
  renderStimulus: boolean;
  /** ms until the stimulus must hide; null => already past/hiding now */
  hideAfterMs: number | null;
  entry: MemWindowEntry;
}

/**
 * Decide how a memorize item may be rendered RIGHT NOW.
 * - No usable record            -> fresh full window (legitimate first view,
 *                                  or prior entry went stale in a later session)
 * - Consumed, or now >= deadline -> stimulus MUST NOT render; entry forced consumed
 * - Otherwise                   -> only the REMAINING time may be shown
 */
export function planMemWindow(
  existing: Record<string, MemWindowEntry> | undefined,
  qid: string,
  now: number,
  memorizeMs: number,
  ttlMs: number,
): MemWindowPlan {
  const prev = existing?.[qid];
  const usable =
    prev &&
    typeof prev.startTs === "number" &&
    typeof prev.deadline === "number" &&
    now - prev.startTs < ttlMs;

  if (!usable) {
    // Fresh, legitimate window (replaces anything stale).
    const entry: MemWindowEntry = { startTs: now, deadline: now + memorizeMs, consumed: false };
    return { renderStimulus: true, hideAfterMs: memorizeMs, entry };
  }

  if (prev.consumed || now >= prev.deadline) {
    const entry: MemWindowEntry = { ...prev, consumed: true };
    return { renderStimulus: false, hideAfterMs: null, entry };
  }

  return { renderStimulus: true, hideAfterMs: Math.max(0, prev.deadline - now), entry: { ...prev } };
}

/** Mark the window over exactly once; consumed windows cannot reopen. */
export function consumeMemWindow(entry: MemWindowEntry): MemWindowEntry {
  return { ...entry, consumed: true, deadline: Math.min(entry.deadline, Date.now()) };
}
