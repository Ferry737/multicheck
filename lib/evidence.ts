/**
 * EVIDENCE GATE — separates "no data" from "measured badly".
 *
 * ROOT CAUSE this fixes: zero-initialisation was read as measurement.
 *   speed = 0        means "never timed"        but evaluated as "very slow"
 *   nextReview = 0   means "never scheduled"    but evaluated as "overdue"
 *   mastery = 0      means "unknown"            but evaluated as "weakest"
 * A brand-new student was therefore told "Satzbau braucht mehr Tempo" and
 * "1 Wiederholung(en) fällig" before answering a single question, and was pushed
 * into speed drills with no accuracy baseline. Five fabricated claims, one cause.
 *
 * Rather than switching the numeric fields to null (43 read sites, and null
 * arithmetic silently collapses to 0 — the same false-zero bug in a new coat),
 * every diagnostic claim must pass an explicit gate here.
 *
 * THRESHOLDS (per the loop spec):
 *   diagnostic claim : >= 8 attempts across >= 2 sessions
 *   speed claim      : >= 5 TIMED attempts (recent[] entries with ms > 0)
 *   review claim     : nextReview must be a real scheduled time (> 0)
 */

export const EVIDENCE = {
  minAttempts: 8,
  minSessions: 2,
  minTimedAttempts: 5,
} as const;

interface EvidenceSub {
  attempts?: number;
  sessions?: number;
  nextReview?: number;
  recent?: { ms?: number }[];
}

/** True when there is enough data to make ANY subskill-specific claim. */
export function hasEvidence(st: EvidenceSub | undefined | null): boolean {
  if (!st) return false;
  return (st.attempts ?? 0) >= EVIDENCE.minAttempts &&
         (st.sessions ?? 0) >= EVIDENCE.minSessions;
}

/** True when there are enough TIMED attempts to make a speed/pace claim. */
export function hasSpeedEvidence(st: EvidenceSub | undefined | null): boolean {
  if (!st) return false;
  if (!hasEvidence(st)) return false;
  const timed = (st.recent ?? []).filter((r) => (r.ms ?? 0) > 0).length;
  return timed >= EVIDENCE.minTimedAttempts;
}

/**
 * True when a review is genuinely scheduled and due.
 * nextReview === 0 means "never scheduled", which must NOT read as overdue.
 */
export function isReviewDue(st: EvidenceSub | undefined | null, now = Date.now()): boolean {
  if (!st) return false;
  const nr = st.nextReview ?? 0;
  return nr > 0 && nr <= now;
}

/** Day-0 copy used wherever a diagnostic claim would otherwise be fabricated. */
export const DIAGNOSTIC_PENDING = "Diagnose läuft. Die ersten Sessions bestimmen deinen Startpunkt.";
export const NOT_YET_ASSESSED = "noch nicht bewertet";
