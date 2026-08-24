"use client";
import { useState, useEffect, useRef } from "react";
import { Button, Card } from "@/components/ui";

const TOPICS = [
  "Beschreibe deinen letzten Arbeitstag in 3–5 Sätzen.",
  "Schreibe eine kurze E-Mail an einen Kunden: Lieferung ist einen Tag verspätet.",
  "Erkläre in eigenen Worten, was ein Lagerarbeiter jeden Tag macht.",
  "Schildere eine Situation, in der du höflich um Hilfe gebeten hast.",
];
const MIN = 10 * 60;
const DRAFT_KEY = "multicheck-textschreiben-draft";

interface Draft { topic: string; text: string; deadline: number; }

export default function Textschreiben() {
  const [started, setStarted] = useState(false);
  const [text, setText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(MIN);
  const [done, setDone] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const deadlineRef = useRef(0);

  // restore draft on mount (handles refresh / reopen / new tab)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (d && d.deadline && d.deadline > Date.now()) {
          setTopic(d.topic); setText(d.text); setStarted(true); setDone(false);
          deadlineRef.current = d.deadline;
          setSecondsLeft(Math.max(0, Math.round((d.deadline - Date.now()) / 1000)));
        } else if (d && d.deadline && d.deadline <= Date.now()) {
          // time already expired while away — restore text but mark time-up so user can still submit
          setTopic(d.topic); setText(d.text); setStarted(true); setDone(false);
          deadlineRef.current = d.deadline;
          setSecondsLeft(0);
        }
      }
    } catch { /* ignore corrupt draft */ }
  }, []);

  // tick once per second based on absolute deadline (anti-exploit: refresh does not reset to 10:00)
  useEffect(() => {
    if (!started || done) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [started, done]);

  // autosave draft (text + absolute deadline) on every change
  useEffect(() => {
    if (started && !done && deadlineRef.current) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ topic, text, deadline: deadlineRef.current } as Draft)); } catch {}
    }
  }, [text, topic, started, done]);

  function start() {
    const t = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    setTopic(t); setText(""); setDone(false); setStarted(true);
    deadlineRef.current = Date.now() + MIN * 1000; // absolute deadline, not UI state
    setSecondsLeft(MIN);
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const timeUp = secondsLeft <= 0;

  function submit() {
    setDone(true); clearDraft();
    setLoading(true);
    fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "writing", prompt: `Bewerte diesen Text annähernd (Training, nicht offiziell). Thema: ${topic}\nText: ${text}\nGib kurzes Feedback zu Aufgabenerfüllung, Klarheit, Struktur, Grammatik, Wortschatz. Max 120 Wörter.` }),
    }).then((r) => r.json()).then((d) => { setFeedback(d.text || "(keine Rückmeldung)"); setLoading(false); })
      .catch(() => { setFeedback("KI gerade nicht erreichbar."); setLoading(false); });
  }

  if (!started) return (
    <div className="enter">
      <h1 className="text-2xl font-semibold tracking-tight">Textschreiben</h1>
      <p className="mt-1 text-sm text-ink-muted">10 Minuten. Realistische Schreibaufgabe wie in der Attest EBA.</p>
      <div className="mt-5"><Button onClick={start}>Schreiben starten</Button></div>
    </div>
  );

  return (
    <div className="enter">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{topic}</span>
        <span className="tnum text-ink-muted">⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} / 10:00</span>
      </div>
      {timeUp && !done && <p className="mt-2 text-sm text-bad">Zeit um — du kannst noch abschicken.</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={done} rows={10}
        placeholder="Schreibe hier…"
        className="mt-4 w-full rounded-md border border-line px-4 py-3 outline-none focus:border-brand resize-none text-base" />
      <div className="mt-2 text-xs text-ink-faint">{words} Wörter</div>
      {!done ? (
        <div className="mt-3"><Button onClick={submit} disabled={words === 0}>Abschicken</Button></div>
      ) : (
        <Card className="mt-4 p-5">
          <p className="text-xs text-ink-faint">Annähernde Trainings-Rückmeldung (KI, nicht offiziell):</p>
          {loading ? <p className="mt-2 text-sm text-ink-muted">Bewertet…</p> : <p className="mt-2 text-sm whitespace-pre-wrap">{feedback}</p>}
        </Card>
      )}
    </div>
  );
}
