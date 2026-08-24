"use client";
import { useState, useEffect, useRef } from "react";
import { Button, Card } from "@/components/ui";

const TOPICS = [
  "Beschreibe deinen letzten Arbeitstag in 3–5 Sätzen.",
  "Schreibe eine kurze E-Mail an einen Kunden: Lieferung ist einen Tag verspätet.",
  "Erkläre in eigenen Worten, was ein Lagerarbeiter jeden Tag macht.",
  "Schildere eine Situation, in der du höflich um Hilfe gebeten hast.",
];

export default function Textschreiben() {
  const [started, setStarted] = useState(false);
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const startRef = useRef(0);

  const MIN = 10 * 60;
  useEffect(() => {
    if (started && !done) { const t = setInterval(() => setSeconds((s) => s + 1), 1000); return () => clearInterval(t); }
  }, [started, done]);

  function start() { setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]); setText(""); setSeconds(0); setStarted(true); setDone(false); startRef.current = performance.now(); }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const timeUp = seconds >= MIN;

  function submit() {
    setDone(true);
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
        <span className="tnum text-ink-muted">⏱ {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} / 10:00</span>
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
