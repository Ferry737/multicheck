// app/api/ai/status/route.ts
// Non-secret AI health status for the UI (Phase 28). Never returns keys/tokens.
import { NextResponse } from "next/server";
import { currentAIConfig, AI_TIMEOUT_MS, AI_MAX_TOKENS } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = currentAIConfig();
  // We do NOT probe the API here (that costs a call). The client can call
  // POST /api/ai/test to get a live, structured status when needed.
  return NextResponse.json({
    configured: cfg.hasKey,
    provider: cfg.provider,
    model: cfg.model,
    // cost-control guardrails (Phase 29) — surfaced for transparency, no secrets
    maxTokens: AI_MAX_TOKENS,
    timeoutMs: AI_TIMEOUT_MS,
    note: cfg.hasKey
      ? "AI is configured. Live status via POST /api/ai/test."
      : "AI not configured. App runs fully deterministically (offline coach).",
  });
}
