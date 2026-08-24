"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

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
    <div className="enter max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">KI-Nachhilfe</h1>
      <p className="mt-1 text-sm text-ink-muted">Stell eine Frage zu Mathe, Deutsch oder einem Konzept. Die KI erklärt einfach und auf Deutsch.</p>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
        placeholder="z.B. Ich verstehe Prozentrechnung nicht. Erkläre es mir mit einem Beispiel."
        className="mt-4 w-full rounded-md border border-line px-4 py-3 outline-none focus:border-brand resize-none" />
      <div className="mt-3"><Button onClick={ask} disabled={loading}>{loading ? "Denkt…" : "Fragen"}</Button></div>
      {text && <Card className="mt-5 p-5"><p className="text-sm whitespace-pre-wrap">{text}</p></Card>}
    </div>
  );
}
