"use client";
import { useState } from "react";

export default function Tutor() {
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  function ask() {
    if (!prompt.trim()) return;
    setLoading(true); setText("");
    fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tutor", prompt }),
    })
      .then((r) => r.json())
      .then((d) => { setText(d.text || "(keine Antwort)"); setLoading(false); })
      .catch(() => { setText("KI gerade nicht erreichbar."); setLoading(false); });
  }

  return (
    <main className="container-x py-8 max-w-2xl">
      <h1 className="text-2xl font-bold">KI-Nachhilfe</h1>
      <p className="mt-2 text-ink-muted">Stell eine Frage zu Mathe, Deutsch oder einem Konzept. Die KI erklärt einfach und auf Deutsch.</p>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
        placeholder="z.B. Ich verstehe Prozentrechnung nicht. Erkläre es mir mit einem Beispiel."
        className="mt-4 w-full rounded-xl border border-line px-4 py-3 outline-none focus:border-brand resize-none" />
      <button onClick={ask} disabled={loading}
        className="mt-3 rounded-xl bg-brand px-6 py-3 text-white font-semibold disabled:opacity-50">
        {loading ? "Denkt…" : "Fragen"}
      </button>
      {text && <div className="mt-5 rounded-card border border-line bg-paper p-5 shadow-card whitespace-pre-wrap text-sm">{text}</div>}
    </main>
  );
}
