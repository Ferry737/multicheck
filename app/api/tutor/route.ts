// app/api/tutor/route.ts
// Secure AI tutor: key read from server env only. Never exposed to client.
// AI is for explanations / hints / "why wrong" — NOT for objective answers.
// On ANY failure we return explicit AI_AVAILABLE=false; the client must use
// deterministic fallback content, never pretend fallback came from the AI.
import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad-body" }, { status: 400 }); }

  const { mode, prompt, context } = body as { mode?: string; prompt?: string; context?: string };
  if (!prompt) return NextResponse.json({ ok: false, error: "no-prompt" }, { status: 400 });

  const system = `Du bist ein geduldiger, erwachsenenfreundlicher Nachhilfelehrer für einen Lernenden, der seit 3-4 Jahren nicht in der Schule war und schwache Mathematik- und Deutschkenntnisse hat. Erkläre einfach, ermutigend, auf Deutsch. Vermeide Scham. Antworte knapp und klar.`;

  const res = await callAI({
    system,
    prompt: `${mode ? `[${mode}]\n` : ""}${context ? context + "\n" : ""}${prompt}`,
    temperature: 0.4,
    maxTokens: 500,
  });

  if (res.ok) {
    return NextResponse.json({ ok: true, text: res.text, aiAvailable: true, model: res.model, latencyMs: res.latencyMs });
  }
  // Explicit failure — no silent fallback text pretending to be AI.
  return NextResponse.json({
    ok: false,
    aiAvailable: false,
    errorCode: res.errorCode ?? "UNKNOWN",
    provider: res.provider,
    model: res.model,
  }, { status: 200 });
}
