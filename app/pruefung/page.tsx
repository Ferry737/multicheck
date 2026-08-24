"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLearner } from "@/lib/useLearner";
import { Button, Card } from "@/components/ui";
import {
  ExamSnapshot, ExamMode, ExamPhase,
  buildExam, enterActive, startQuestion, answerCurrent, advance, submit, finalize,
  currentQuestion, remainingMs, examBreakdown, fatigueAnalysis, applyExamToModel, weeklyPlan,
  AutoPlan,
} from "@/lib/exam";
import { subskillById, AREAS } from "@/lib/curriculum";

const KEY = "multicheck-exam-v1";

function loadExam(): ExamSnapshot | null {
  try { const r = localStorage.getItem(KEY); if (!r) return null; const p = JSON.parse(r); if (p && p.sections?.length) return p as ExamSnapshot; } catch {}
  return null;
}
function saveExam(s: ExamSnapshot) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
function clearExam() { try { localStorage.removeItem(KEY); } catch {} }

const MODE_CFG: Record<ExamMode, { title: string; totalMin: number }> = {
  standort: { title: "Standortbestimmung", totalMin: 10 },
  mini: { title: "Mini-Simulation", totalMin: 25 },
  voll: { title: "Vollständige Simulation", totalMin: 90 },
};

export default function Pruefung() {
  const { model, ready, applySim } = useLearner();
  const [mode, setMode] = useState<ExamMode | null>(null);
  const [snap, setSnap] = useState<ExamSnapshot | null>(null);
  const [resume, setResume] = useState<ExamSnapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [input, setInput] = useState("");
  const [writing, setWriting] = useState("");
  const [result, setResult] = useState<null | { overall: any; areas: any[]; subs: any[]; fatigue: any; plan: AutoPlan }>(null);

  useEffect(() => { const r = loadExam(); if (r && !r.submitted) setResume(r); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const set = useCallback((s: ExamSnapshot) => { setSnap(s); saveExam(s); }, []);

  const start = (m: ExamMode) => {
    const s = buildExam(m);
    s.phase = "instructions";
    setSnap(s); saveExam(s); setMode(m);
  };
  const resumeExam = () => { if (resume) { setSnap(resume); setMode(resume.mode); setResume(null); } };

  if (!ready || !model) return <div className="text-sm text-ink-faint">Lade…</div>;

  if (!snap) {
    return (
      <div className="enter">
        <h1 className="text-2xl font-semibold tracking-tight">Prüfung</h1>
        <p className="mt-1 text-sm text-ink-muted">Realistische Trainings-Simulationen — keine offiziellen Multicheck-Aufgaben.</p>
        {resume && (
          <Card className="mt-4 p-4 max-w-xl border-brand/40">
            <p className="text-sm">Laufende Prüfung gefunden ({MODE_CFG[resume.mode].title}).</p>
            <Button className="mt-3" onClick={resumeExam}>Prüfung fortsetzen</Button>
            <Button variant="secondary" className="mt-3 ml-2" onClick={() => { clearExam(); setResume(null); }}>Neu starten</Button>
          </Card>
        )}
        <div className="mt-6 space-y-3 max-w-xl">
          {(["standort","mini","voll"] as ExamMode[]).map((m) => (
            <button key={m} onClick={() => start(m)} className="w-full text-left rounded-card border border-line bg-surface p-5 shadow-card hover:border-brand/50 transition-colors">
              <div className="flex justify-between items-center">
                <h2 className="font-semibold">{MODE_CFG[m].title}</h2>
                <span className="text-xs text-ink-faint">~{MODE_CFG[m].totalMin} Min.</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const q = currentQuestion(snap);
  const sec = snap.sections[snap.currentSection];
  const areaName = AREAS.find((a) => a.id === sec?.area)?.label ?? sec?.area;
  const remMs = remainingMs(snap, now);
  const remMin = Math.floor(remMs / 60000);
  const remSec = Math.floor((remMs % 60000) / 1000);
  const timeUp = remMs <= 0 && snap.phase !== "completed";

  const begin = () => set(enterActive({ ...snap, phase: "active" }, Date.now()));
  const onAnswer = (v: string) => {
    setInput(""); // never carry an answer into the next question
    // compute answer + advance from the SAME snapshot synchronously — a deferred
    // next() would close over the stale snap and overwrite the recorded answer.
    const answered = answerCurrent({ ...snap, phase: snap.phase === "active" ? "active" : snap.phase }, v, Date.now());
    let s = advance(answered, Date.now());
    set(s);
    if (s.phase === "active") s = enterActive(s, Date.now());
    set(s);
  };
  const next = () => {
    let s = advance(snap, Date.now());
    set(s);
    if (s.phase === "active") s = enterActive(s, Date.now());
    set(s);
  };

  // finish MUST be declared before any phase render that references it (TDZ crash otherwise)
  const finish = () => {
    let s = submit(snap, Date.now());
    s = finalize(s);
    const bd = examBreakdown(s);
    const fat = fatigueAnalysis(s);
    let m2 = applyExamToModel(model, s, snap.mode);
    applySim(Object.keys(s.correct).map((id) => {
      const sec2 = s.sections.find((x) => x.questions.some((q2) => q2.id === id))!;
      const q2 = sec2.questions.find((x) => x.id === id)!;
      return { subskill: q2.subskill, correct: s.correct[id], ms: s.responseTimes[id] || 0 };
    }), snap.mode === "voll" ? "full-sim" : "mini-sim");
    const plan = weeklyPlan(m2);
    clearExam();
    setResult({ overall: bd.overall, areas: bd.areas, subs: bd.subs, fatigue: fat, plan });
    set(s);
  };

  // Memory realism: stimulus phase for questions with memorizeMs set
  const memQ = q && q.memorizeMs ? q : null;
  const isMemoryStimulusPhase = !!memQ && !(snap.memorizePhaseEnded?.[snap.currentSection]);
  const memTimeLeft = isMemoryStimulusPhase ? Math.max(0, (snap.startedAt + 5000 + (memQ?.memorizeMs ?? 4000)) - now) : 0;

  // ---- render by phase ----
  if (snap.phase === "instructions") {
    return (
      <Card className="mt-6 p-6 max-w-xl">
        <h1 className="text-xl font-semibold">{MODE_CFG[snap.mode].title}</h1>
        <ul className="mt-3 text-sm text-ink-muted list-disc pl-5 space-y-1">
          <li>Kein Feedback während der Prüfung.</li>
          <li>Antworten werden erst im Ergebnis gezeigt.</li>
          <li>Timer läuft automatisch — Refresh behält die verbleibende Zeit.</li>
          <li>Merke-Aufgaben: Reize kurz ansehen, dann verschwindet der Reiz.</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <Button onClick={begin}>Prüfung beginnen</Button>
          <Button variant="secondary" onClick={() => { clearExam(); setSnap(null); setMode(null); }}>Abbrechen</Button>
        </div>
      </Card>
    );
  }

  if (snap.phase === "transition") {
    const nextArea = AREAS.find((a) => a.id === snap.sectionOrder[snap.currentSection])?.label ?? "";
    const lastFinished = snap.finishedSections[snap.finishedSections.length - 1];
    const finishedArea = AREAS.find((a) => a.id === snap.sectionOrder[lastFinished])?.label ?? "";
    return (
      <Card className="mt-6 p-6 max-w-xl text-center">
        <p className="text-sm text-ink-muted">{finishedArea} abgeschlossen.</p>
        <h1 className="mt-2 text-xl font-semibold">Nächster Bereich: {nextArea}</h1>
        <div className="mt-4 text-xs text-ink-faint">Fortschritt: {snap.finishedSections.length}/{snap.sections.length} Bereiche</div>
        <Button className="mt-5" onClick={() => set(enterActive(snap, Date.now()))}>Weiter</Button>
      </Card>
    );
  }

  if (snap.phase === "writing") {
    // Textschreiben: persistent draft + absolute deadline
    const wRem = Math.max(0, snap.writingDeadline - now);
    const wMin = Math.floor(wRem / 60000);
    return (
      <Card className="mt-6 p-6 max-w-2xl">
        <h1 className="text-xl font-semibold">Textschreiben</h1>
        <p className="mt-2 text-sm text-ink-muted">Verbleibend: {wMin} Min. — Entwurf wird automatisch gespeichert.</p>
        <textarea value={writing} onChange={(e) => { setWriting(e.target.value); set({ ...snap, writingDraft: e.target.value }); }}
          className="mt-3 w-full h-64 rounded-md border border-line p-3 text-base outline-none focus:border-brand" placeholder="Schreibe hier…" />
        <Button className="mt-3" onClick={() => set(advance(snap, Date.now()))}>Weiter</Button>
      </Card>
    );
  }

  if (snap.phase === "confirming") {
    return (
      <Card className="mt-6 p-6 max-w-xl text-center">
        <h1 className="text-xl font-semibold">Prüfung abgeben?</h1>
        <p className="mt-2 text-sm text-ink-muted">Danach sind keine Änderungen mehr möglich.</p>
        <div className="mt-5 flex gap-2 justify-center">
          <Button onClick={() => finish()}>Abgeben</Button>
          <Button variant="secondary" onClick={() => set({ ...snap, phase: "active" })}>Zurück</Button>
        </div>
      </Card>
    );
  }

  if (snap.phase === "completed" && result) {
    return <ResultsView r={result} onClose={() => { setSnap(null); setMode(null); setResult(null); }} />;
  }

  // active session
  // Memory realism render
  if (isMemoryStimulusPhase) {
    return (
      <Card className="mt-6 p-6 max-w-xl">
        <p className="text-xs text-ink-faint">Merken Sie sich den Reiz. Er verschwindet in {Math.ceil(memTimeLeft/1000)}s.</p>
        <div className="mt-3 rounded-card bg-page p-6 text-center" dangerouslySetInnerHTML={{ __html: q?.stimulus || "" }} />
        {memTimeLeft <= 0 && (
          <Button className="mt-4" onClick={() => set({ ...snap, memorizePhaseEnded: { ...(snap.memorizePhaseEnded||{}), [snap.currentSection]: true } })}>Weiter</Button>
        )}
      </Card>
    );
  }

  return (
    <div className="enter max-w-xl mx-auto px-6 py-6">
      <div className="flex justify-between items-center text-sm">
        <span className="text-ink-muted">{areaName}</span>
        <span className="font-mono tabular-nums text-ink-strong">{remMin}:{String(remSec).padStart(2,"0")}</span>
      </div>
      <div className="mt-1 text-xs text-ink-faint">Frage {snap.currentIndex + 1}/{sec?.order.length} · Bereich {snap.currentSection+1}/{snap.sections.length}</div>
      {timeUp && <p className="mt-2 text-sm text-bad">Zeit abgelaufen.</p>}
      {q && (
        <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-base leading-relaxed">{q.prompt}</p>
          {q.stimulus && !q.memorizeMs && <div className="mt-4 rounded-md bg-page p-4" dangerouslySetInnerHTML={{ __html: q.stimulus }} />}
          <div className="mt-4 space-y-2">
            {(q.options ?? []).map((opt, oi) => (
              <button key={opt + "#" + oi} onClick={() => onAnswer(opt)} className="w-full text-left rounded-md border border-line px-4 py-3 hover:border-brand transition-colors">{opt}</button>
            ))}
            {!q.options && (
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&input&&onAnswer(input)}
                  className="w-full rounded-md border border-line px-4 py-3 outline-none focus:border-brand" placeholder="Antwort…" />
                <button onClick={() => input && onAnswer(input)} disabled={!input}
                  className="shrink-0 rounded-md bg-brand px-5 py-3 text-white font-medium disabled:opacity-40">Antworten</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsView({ r, onClose }: { r: any; onClose: () => void }) {
  return (
    <div className="enter max-w-2xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-semibold">Ergebnis</h1>
      <p className="mt-1 text-sm text-ink-muted">Genauigkeit gesamt: {Math.round(r.overall.accuracy * 100)}% · Ø {Math.round(r.overall.avgMs/1000*10)/10}s/Aufgabe</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {r.areas.map((a: any) => (
          <div key={a.area} className={`rounded-card border p-3 ${a.weak ? "border-bad/40 bg-bad/5" : "border-line bg-surface"}`}>
            <p className="text-xs text-ink-faint">{a.area}</p>
            <p className="text-lg font-semibold">{Math.round(a.accuracy*100)}%</p>
            <p className="text-xs text-ink-muted">Tempo {Math.round(a.avgMs/1000*10)/10}s</p>
          </div>
        ))}
      </div>
      <h2 className="mt-6 text-sm font-medium text-ink-muted">Details nach Fähigkeit</h2>
      <div className="mt-2 space-y-1">
        {r.subs.map((s: any) => (
          <div key={s.subskill} className="flex justify-between text-sm border-b border-line/50 py-1">
            <span>{subskillById(s.subskill)?.name ?? s.subskill}</span>
            <span className={s.accuracy < 0.6 ? "text-bad" : "text-ink-strong"}>{Math.round(s.accuracy*100)}%</span>
          </div>
        ))}
      </div>
      {r.fatigue.degraded && (
        <p className="mt-4 rounded-md bg-bad/5 border border-bad/30 p-3 text-sm">Leistung unter Zeitdruck gesunken (erste {Math.round(r.fatigue.first*100)}% → letzte {Math.round(r.fatigue.final*100)}%). Nächste Schritte: Ausdauer- und Tempotraining.</p>
      )}
      <div className="mt-6 rounded-card border border-brand/30 bg-brand/5 p-4">
        <p className="text-sm font-medium">Nächster Plan</p>
        <p className="mt-1 text-sm">{r.plan.today}</p>
        <p className="mt-1 text-xs text-ink-muted">{r.plan.notes.join(" · ")}</p>
      </div>
      <Button className="mt-5" onClick={onClose}>Schließen</Button>
    </div>
  );
}
