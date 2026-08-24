"use client";
import { useState, useEffect, useRef } from "react";

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
    <main className="container-x py-10 max-w-xl text-center">
      <h1 className="text-2xl font-bold">Textschreiben</h1>
      <p className="mt-3 text-ink-muted">10 Minuten. Realistische Schreibaufgabe wie in der Attest EBA.</p>
      <button onClick={start} className="mt-6 rounded-xl bg-brand px-6 py-3 text-white font-semibold">Schreiben starten</button>
    </main>
  );

  return (
    <main className="container-x py-8 max-w-2xl">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{topic}</span>
        <span className="tabular text-ink-muted">⏱ {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} / 10:00</span>
      </div>
      {timeUp && !done && <p className="mt-2 text-sm text-bad">Zeit um — du kannst noch abschicken.</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={done} rows={10}
        placeholder="Schreibe hier…"
        className="mt-4 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand resize-none" />
      <div className="mt-2 text-xs text-ink-faint">{words} Wörter</div>
      {!done ? (
        <button onClick={submit} className="mt-3 rounded-xl bg-brand px-6 py-3 text-white font-semibold disabled:opacity-40" disabled={words === 0}>Abschicken</button>
      ) : (
        <div className="mt-4 rounded-card border border-line bg-paper p-5 shadow-card">
          <p className="text-xs text-ink-faint">Annähernde Trainings-Rückmeldung (KI, nicht offiziell):</p>
          {loading ? <p className="mt-2 text-sm text-ink-muted">Bewertet…</p> : <p className="mt-2 text-sm whitespace-pre-wrap">{feedback}</p>}
        </div>
      )}
    </main>
  );
}
