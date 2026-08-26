"use client";
import { useState } from "react";
import { useLearner } from "@/lib/useLearner";
import { Card, Button } from "@/components/ui";
import { twoMonthProgram } from "@/lib/coach";

/**
 * Settings — primarily the exam date.
 *
 * Why this route exists: examDate was hardcoded to 2026-10-15 with NO way to
 * change it (20 routes probed, all 404). That date feeds twoMonthProgram(),
 * which selects the training phase. Because weeks clamps at 8, far-future dates
 * produced an identical arc — but a student whose exam is SOONER than the
 * hardcoded date was served "Grundlagen" and never reached the simulation phase
 * before sitting the real exam.
 */
function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export default function EinstellungenPage() {
  const { model, ready, save } = useLearner();
  const [saved, setSaved] = useState(false);

  if (!ready || !model) return <div className="enter"><p className="text-sm text-ink-muted">Lade…</p></div>;

  const current = model.examDate || "";
  const dLeft = current ? daysUntil(current) : null;
  const phases = current ? twoMonthProgram(model) : [];

  const onChange = (v: string) => {
    if (!v) return;
    save({ ...model, examDate: v });
    setSaved(true);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>

      <Card className="mt-4">
        <h2 className="text-base font-medium">Prüfungstermin</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Dein Prüfungsdatum bestimmt den Trainingsplan. Liegt die Prüfung weniger als
          3 Wochen entfernt, wird direkt auf Simulationen und Tempo umgestellt.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="date"
            min={today}
            defaultValue={current}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Prüfungstermin"
            className="rounded-md border border-line px-3 py-2 text-base min-h-[44px]"
          />
          {dLeft !== null && (
            <span className="text-sm text-ink-muted tnum">{dLeft} Tage</span>
          )}
        </div>
        {saved && <p className="mt-2 text-sm text-brand">Gespeichert.</p>}
        {!current && (
          <p className="mt-2 text-sm text-amber-700">
            Noch kein Termin gesetzt — bitte Datum wählen, damit der Plan stimmt.
          </p>
        )}
      </Card>

      {phases.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-medium">Dein Trainingsplan</h2>
          <ul className="mt-2 space-y-1.5">
            {phases.map((p) => (
              <li key={p.week} className="text-sm">
                <span className="text-ink-muted tnum">Woche {p.week}:</span>{" "}
                <span className="font-medium">{p.label}</span>{" "}
                <span className="text-ink-muted">· {p.minutesPerDay} Min/Tag</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="text-base font-medium">Daten</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Dein Fortschritt wird nur lokal in diesem Browser gespeichert.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            if (confirm("Wirklich allen Fortschritt löschen? Das kann nicht rückgängig gemacht werden.")) {
              try {
                localStorage.removeItem("multicheck-coach-v3");
                localStorage.removeItem("multicheck-exam-v1");
                location.reload();
              } catch { /* ignore */ }
            }
          }}
        >
          Fortschritt zurücksetzen
        </Button>
      </Card>
    </div>
  );
}
