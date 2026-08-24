"use client";
import { useLearner } from "@/lib/useLearner";
import { SKILLS, SUBJECTS } from "@/lib/curriculum";
import { readinessBySubject } from "@/lib/learner";

export default function Progress() {
  const { model, ready } = useLearner();
  if (!ready || !model) return <div className="container-x py-20">Lade…</div>;
  const bySubj = readinessBySubject(model);

  return (
    <main className="container-x py-8">
      <h1 className="text-2xl font-bold">Fortschritt</h1>

      <h2 className="mt-8 text-lg font-semibold">Bereitschaft nach Bereich</h2>
      <div className="grid sm:grid-cols-3 gap-4 mt-4">
        {SUBJECTS.map((s) => (
          <div key={s.id} className="rounded-card border border-line bg-paper p-5 shadow-card">
            <div className="flex justify-between"><span>{s.label}</span><span className="font-bold tabular">{bySubj[s.id]}%</span></div>
            <div className="mt-3 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-brand" style={{ width: `${bySubj[s.id]}%` }} /></div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-lg font-semibold">Fertigkeiten im Detail</h2>
      <div className="mt-4 rounded-card border border-line bg-paper shadow-card overflow-hidden">
        {SKILLS.map((sk) => {
          const st = model.skills[sk.id];
          const m = Math.round((st?.mastery ?? 0) * 100);
          return (
            <div key={sk.id} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-0">
              <div>
                <span className="font-medium">{sk.name}</span>
                <span className="ml-2 text-xs text-ink-faint">{sk.subject} · {st?.seen ?? 0}× geübt</span>
              </div>
              <div className="flex items-center gap-3 w-40">
                <div className="flex-1 h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-brand" style={{ width: `${m}%` }} /></div>
                <span className="tabular text-sm w-10 text-right">{m}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => { if (confirm("Lerndaten wirklich löschen?")) location.reload(); }}
        className="mt-8 text-sm text-ink-faint hover:text-bad">Lerndaten löschen</button>
    </main>
  );
}
