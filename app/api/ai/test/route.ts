// app/api/ai/test/route.ts
// Real connection test. Server-side only. Never returns secrets.
import { NextRequest, NextResponse } from "next/server";
import { callAI, currentAIConfig } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  const cfg = currentAIConfig();
  if (!cfg.hasKey && cfg.provider !== "nous") {
    return NextResponse.json({ available: false, provider: cfg.provider, model: cfg.model, errorCode: "AUTH_REQUIRED" });
  }
  const started = Date.now();
  const res = await callAI({
    system: "Antworte mit genau einem Wort: bereit",
    prompt: "Bist du erreichbar? Antworte nur mit dem Wort bereit.",
    maxTokens: 20,
    temperature: 0,
  });
  if (res.ok) {
    return NextResponse.json({
      available: true,
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
    });
  }
  return NextResponse.json({
    available: false,
    provider: res.provider,
    model: res.model,
    latencyMs: Date.now() - started,
    errorCode: res.errorCode ?? "UNKNOWN",
  });
}
