"use client";
import { useEffect, useState } from "react";

/**
 * One-time notice for the pre-76ce485 exam-grading remediation.
 *
 * The grading defect (typed numeric answers like "1,0" / "24,60" scored WRONG)
 * had already been folded into simPerf/confidence before it was found, and the
 * raw simulation answers were deleted on submit, so those values could not be
 * recomputed — they were reset instead. An unexplained metric drop damages
 * trust more than the wrong number did, so the student is told exactly what
 * happened and what was preserved.
 *
 * Dismissal is persisted, so it never nags.
 */
const DISMISS_KEY = "multicheck-simregrade-dismissed-v1";

export default function SimRegradeNotice({ notice }: { notice: string | null }) {
  const [dismissed, setDismissed] = useState(true); // assume dismissed until storage is read

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false); // storage unavailable: show it rather than hide silently
    }
  }, []);

  if (!notice || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
  };

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Hinweis zu früheren Simulationen</p>
          <p className="mt-1 leading-snug">
            Wegen eines Bewertungsfehlers wurden Zahlenformate wie <strong>1,0</strong> oder{" "}
            <strong>24,60</strong> früher als falsch gewertet. Die betroffenen
            Simulations-Werte wurden deshalb zurückgesetzt. Dein Trainingsfortschritt
            (Beherrschung aus dem Üben) bleibt erhalten. Starte eine neue Simulation
            für eine korrekte Einschätzung.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Hinweis schließen"
          className="shrink-0 rounded-md border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100 min-h-[32px]"
        >
          OK
        </button>
      </div>
    </div>
  );
}
