// app/api/tutor/route.ts
// Secure AI tutor: key read from env server-side only. Never exposed to client.
// Used for explanations / hints / "why wrong" — NOT for answers (those are deterministic).
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";

const ZAI_URL = "https://api.z.ai/api/paas/v4/chat/completions";

function getKey(): string | undefined {
  if (process.env.AI_API_KEY) return process.env.AI_API_KEY;
  // local fallback (Vercel sets the real env var; this path only helps local dev)
  try {
    const raw = readFileSync("/opt/data/.env", "utf8");
    for (const line of raw.split("\n")) {
      if (line.startsWith("AI_API_KEY=")) return line.slice("AI_API_KEY=".length).trim();
    }
  } catch {}
  return undefined;
}

export async function POST(req: NextRequest) {
  const key = getKey();
  if (!key) {
    return NextResponse.json({ ok: false, error: "no-key", text: FALLBACK }, { status: 200 });
  }
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 }); }

  const { mode, prompt, context } = body as { mode?: string; prompt?: string; context?: string };
  if (!prompt) return NextResponse.json({ ok: false, error: "no-prompt" }, { status: 400 });

  const system = `Du bist ein geduldiger, erwachsenenfreundlicher Nachhilfelehrer für einen Lernenden, der seit 3-4 Jahren nicht in der Schule war und schwache Mathematik- und Deutschkenntnisse hat. Erkläre einfach, ermutigend, auf Deutsch. Vermeide Scham. Antworte knapp und klar.`;

  try {
    const r = await fetch(ZAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "glm-4.5-air",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${mode ? `[${mode}]\n` : ""}${context ? context + "\n" : ""}${prompt}` },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: "upstream-" + r.status, text: FALLBACK }, { status: 200 });
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? FALLBACK;
    return NextResponse.json({ ok: true, text });
  } catch {
    return NextResponse.json({ ok: false, error: "network", text: FALLBACK }, { status: 200 });
  }
}

const FALLBACK =
  "Erklärung ist gerade nicht verfügbar. Versuche es mit einem Arbeitsbeispiel: lies die Aufgabe Schritt für Schritt, rechne das Kleine vor, dann das Ganze. Wenn du feststeckst, sag Bescheid.";
