"use client";
import { useLearner } from "@/lib/useLearner";
import { AREAS } from "@/lib/curriculum";
import { masteryOf, accuracy, avgSpeed, quadrant, readinessByArea, overallReadiness } from "@/lib/learner";

export default function Fortschritt() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="container-x py-20 text-ink-muted">Lade…</div>;

  const acc = accuracy(model), spd = avgSpeed(model), q = quadrant(model);
  const byArea = readinessByArea(model);
  const studiedMin = Math.round(model.totalStudyMs / 60000);

  return (
    <main className="container-x py-8 max-w-3xl">
      <h1 className="text-2xl font-bold">Fortschritt</h1>

      <div className="grid sm:grid-cols-4 gap-3 mt-6">
        <Stat label="Bereitschaft" value={overallReadiness(model) + "%"} />
        <Stat label="Genauigkeit" value={acc + "%"} />
        <Stat label="Ø Tempo" value={spd + "s"} />
        <Stat label="Trainiert" value={studiedMin + " Min"} />
      </div>

      {/* Accuracy vs Speed quadrant */}
      <h2 className="mt-8 text-lg font-semibold">Genauigkeit vs. Tempo</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 max-w-md">
        <Quad label="Schnell + genau" active={q === "accurate+fast"} good />
        <Quad label="Langsam + genau" active={q === "accurate+slow"} />
        <Quad label="Schnell + fehlerhaft" active={q === "inaccurate+fast"} bad />
        <Quad label="Langsam + fehlerhaft" active={q === "inaccurate+slow"} bad />
      </div>
      <p className="mt-2 text-xs text-ink-faint">Trainingswerte (Genauigkeit / Tempo / Trainingsleistung) — keine offiziellen Multicheck-Werte.</p>

      <h2 className="mt-8 text-lg font-semibold">Bereich nach Bereich</h2>
      <div className="mt-3 rounded-card border border-line bg-paper shadow-card overflow-hidden">
        {AREAS.map((a) => {
          const r = byArea[a.id];
          return (
            <div key={a.id} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-0">
              <span>{a.label}</span>
              <div className="flex items-center gap-3 w-44">
                <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-brand" style={{ width: `${r}%` }} /></div>
                <span className="tabular text-sm w-10 text-right">{r}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Fertigkeiten</h2>
      <div className="mt-3 rounded-card border border-line bg-paper shadow-card overflow-hidden">
        {AREAS.flatMap((a) => a.subskills).map((s) => {
          const m = Math.round(masteryOf(model, s.id) * 100);
          return (
            <div key={s.id} className="flex items-center justify-between px-5 py-2.5 border-b border-line last:border-0">
              <span className="text-sm">{s.name}</span>
              <span className="tabular text-sm">{m}%</span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-card border border-line bg-paper p-4 shadow-card"><p className="text-xs text-ink-faint">{label}</p><p className="mt-1 text-xl font-bold tabular">{value}</p></div>;
}
function Quad({ label, active, good, bad }: { label: string; active: boolean; good?: boolean; bad?: boolean }) {
  return <div className={`rounded-xl border p-3 text-sm ${active ? (good ? "border-good bg-good/10" : bad ? "border-bad bg-bad/10" : "border-brand bg-brand-soft") : "border-line bg-paper"}`}>{label}</div>;
}
