"use client";
import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { offlineHintFor, offlineSessionSummary } from "@/lib/offlineCoach";

export default function Tutor() {
  const [prompt, setPrompt] = useState("");
  const [text, setText] = useState("");
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastQ, setLastQ] = useState<{ subskill: string; prompt: string; answer: string; student: string } | null>(null);

  // Deterministic offline hint (Phase 20): always works, no AI needed.
  function askOffline() {
    if (!lastQ) { setText("Öffne zuerst eine Aufgabe und beantworte sie — dann erkläre ich den Lösungsweg."); return; }
    const q = { subskill: lastQ.subskill, type: inferType(lastQ.prompt), area: "", prompt: lastQ.prompt, answer: lastQ.answer, options: undefined, kind: "input" as const, difficulty: 30, difficultyScore: 30, concept: lastQ.subskill, estimatedTime: 20, examRelevance: 3, commonErrors: "", explanation: "" };
    const h = offlineHintFor(q as any, lastQ.student);
    setText(`💡 ${h.short}\n\nLösungsweg: ${h.method}\n\n(${h.similar})`);
    setAiAvailable(false);
  }

  async function askAI() {
    setBusy(true);
    try {
      const r = await fetch("/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const d = await r.json();
      setAiAvailable(d.aiAvailable);
      if (!d.aiAvailable) {
        askOffline();
      } else {
        setText(d.reply || "(keine Antwort)");
      }
    } catch {
      setAiAvailable(false);
      askOffline();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="enter max-w-xl mx-auto px-6 py-8">
      <p className="text-2xs uppercase tracking-wide text-brand font-medium">Coach fragen</p>
      <h1 className="text-xl font-semibold mt-1">Verstehen, nicht nur Antworten</h1>
      <p className="text-sm text-ink-muted mt-2">
        Der Coach erklärt den Lösungsweg. Wenn die KI gerade nicht erreichbar ist, bekommst du trotzdem eine
        deterministische Hilfe — das Training läuft immer.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Woran hängst du? (z.B. 'Warum ist 20% von 50 = 10?')"
        className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        rows={3}
      />
      <div className="mt-3 flex gap-2">
        <Button onClick={askAI} disabled={busy}>{busy ? "…" : "Mit KI fragen"}</Button>
        <Button variant="ghost" onClick={askOffline}>Coach-Hinweis (offline)</Button>
      </div>
      {aiAvailable === false && (
        <p className="mt-2 text-2xs text-ink-faint">KI derzeit nicht verfügbar (kein Credit / offline). Deterministische Hilfe wird gezeigt.</p>
      )}
      {text && (
        <Card className="mt-5 p-4 whitespace-pre-wrap text-sm">{text}</Card>
      )}
    </div>
  );
}

// crude type inference from prompt text (offline path only)
function inferType(p: string): string {
  if (p.includes("%")) return "pct";
  if (p.includes("CHF")) return "money";
  if (p.includes("Rechne um")) return "conv";
  if (p.includes("Kopfrechnen")) return "mental";
  if (p.includes("Addiere") || p.includes("/")) return "frac";
  if (p.includes("Zähle") || p.includes("Symbole")) return "count";
  if (p.includes("Satz") || p.includes("Satzbau")) return "satzbau";
  if (p.includes("Schritte") || p.includes("Reihenfolge")) return "prozesslogik";
  if (p.includes("Gruppe") || p.includes("nicht")) return "wortgruppen";
  if (p.includes("ordne") || p.includes("aufsteigend")) return "sortierverfahren";
  return "concept";
}
