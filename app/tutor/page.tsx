"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui";

export default function Tutor() {
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  function ask() {
    if (!prompt.trim()) return;
    setLoading(true); setText(""); setUnavailable(false);
    fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tutor", prompt }),
    })
      .then((r) => r.json())
      .then((d) => {
        setLoading(false);
        // Explicit AI failure: do NOT pretend fallback text came from the AI.
        if (!d.ok || d.aiAvailable === false) {
          setUnavailable(true);
          setText("");
          return;
        }
        setText(d.text || "(keine Antwort)");
      })
      .catch(() => { setLoading(false); setUnavailable(true); });
  }

  return (
    <div className="enter max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Coach fragen</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Die KI erklärt Konzepte, hilft bei Fehlern und gibt Tipps. Sie ist ein Assistent hinter dem Training – sie ersetzt keine Übung und kennt keine anderen Antworten als die geprüften.
      </p>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
        placeholder="z.B. Ich verstehe Prozentrechnung nicht. Erkläre es mir mit einem Beispiel."
        className="mt-4 w-full rounded-md border border-line px-4 py-3 outline-none focus:border-brand resize-none" />
      <div className="mt-3"><Button onClick={ask} disabled={loading}>{loading ? "Denkt…" : "Fragen"}</Button></div>
      {unavailable && (
        <Card className="mt-5 p-5 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            Die KI ist momentan nicht verfügbar (kein Schlüssel, kein Guthaben oder Anbieter nicht erreichbar).
            Das Training läuft trotzdem weiter – Erklärungen kommen aus den validierten Inhalten.
          </p>
        </Card>
      )}
      {text && <Card className="mt-5 p-5"><p className="text-sm whitespace-pre-wrap">{text}</p></Card>}
    </div>
  );
}
