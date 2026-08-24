"use client";
import { useLearner } from "@/lib/useLearner";
import { AREAS } from "@/lib/curriculum";
import { masteryOf, accuracy, avgSpeed, quadrant, readinessByArea, overallReadiness } from "@/lib/learner";
import { Card, StatCard, ProgressRing, Bar } from "@/components/ui";

export default function Fortschritt() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  const acc = accuracy(model), spd = avgSpeed(model), q = quadrant(model);
  const byArea = readinessByArea(model);
  const studiedMin = Math.round(model.totalStudyMs / 60000);

  return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Fortschritt</h1>

      <div className="grid sm:grid-cols-4 gap-3 mt-5">
        <StatCard label="Trainingsleistung" value={overallReadiness(model) + "%"} />
        <StatCard label="Genauigkeit" value={acc + "%"} accent={acc >= 75 ? "good" : acc >= 50 ? "warn" : "bad"} />
        <StatCard label="Ø Tempo" value={spd + "s"} />
        <StatCard label="Trainiert" value={studiedMin + "′"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        <Card className="p-5 flex items-center gap-5">
          <ProgressRing value={overallReadiness(model)} label="bereit" />
          <div>
            <p className="font-semibold">Gesamtbereitschaft</p>
            <p className="text-sm text-ink-muted mt-1">Trainingswert — keine offizielle Multicheck-Note.</p>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-2xs uppercase tracking-wide text-ink-faint">Genauigkeit vs. Tempo</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Quad label="Schnell + genau" active={q === "accurate+fast"} good />
            <Quad label="Langsam + genau" active={q === "accurate+slow"} />
            <Quad label="Schnell + fehlerhaft" active={q === "inaccurate+fast"} bad />
            <Quad label="Langsam + fehlerhaft" active={q === "inaccurate+slow"} bad />
          </div>
        </Card>
      </div>

      <h2 className="text-sm font-semibold text-ink-soft mt-7 mb-2">Bereich nach Bereich</h2>
      <Card className="divide-y divide-line">
        {AREAS.map((a) => {
          const r = byArea[a.id];
          return (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{a.label}</span>
              <div className="flex items-center gap-3 w-44">
                <div className="flex-1"><Bar value={r} /></div>
                <span className="text-sm font-semibold tnum w-9 text-right">{r}%</span>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Quad({ label, active, good, bad }: { label: string; active: boolean; good?: boolean; bad?: boolean }) {
  return <div className={`rounded-md border p-3 text-xs ${active ? (good ? "border-good bg-goodSoft" : bad ? "border-bad bg-badSoft" : "border-brand bg-brand-soft") : "border-line bg-paper"}`}>{label}</div>;
}
