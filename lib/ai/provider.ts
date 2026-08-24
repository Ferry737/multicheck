// lib/ai/provider.ts
// Secure AI provider abstraction. Server-side ONLY.
// The web app NEVER sees a credential. Keys live in Vercel/env (server).
// AI is a TEACHER/ASSISTANT, never the source of truth for correct answers.
//
// Supported providers (all OpenAI-compatible /chat/completions):
//   nous        -> Nous Portal inference (default). Auth: short-lived invoke JWT.
//   openrouter  -> OpenAI-compatible, long-lived API key.
//   zai         -> Z.AI (glm models), long-lived API key.
//   generic     -> any OpenAI-compatible base URL + key.
//
// Configuration (server env only):
//   AI_PROVIDER      nous | openrouter | zai | generic   (default: nous)
//   AI_MODEL         model id (default depends on provider; nous -> z-ai/glm-5.3)
//   AI_BASE_URL      override base URL (default per provider)
//   AI_API_KEY       provider API key / invoke JWT (server only)
//   AI_TIMEOUT_MS    request timeout (default 20000)
//   AI_TAGS          optional comma list of portal tags (nous)

export type AIProviderId = "nous" | "openrouter" | "zai" | "generic";

export interface AIRequest {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean; // request structured JSON output
}

export interface AIResult {
  ok: boolean;
  text: string;
  provider: AIProviderId;
  model: string;
  latencyMs: number;
  errorCode?: AIErrorCode;
}

export type AIErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIAL"
  | "INSUFFICIENT_BALANCE"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "TIMEOUT"
  | "PROVIDER_DOWN"
  | "BAD_RESPONSE"
  | "UNKNOWN";

const DEFAULTS: Record<AIProviderId, { baseUrl: string; model: string }> = {
  nous: { baseUrl: "https://inference-api.nousresearch.com/v1", model: "z-ai/glm-5.3" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "z-ai/glm-5.3" },
  zai: { baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-4.5-air" },
  generic: { baseUrl: "", model: "" },
};

function getProvider(): AIProviderId {
  const p = (process.env.AI_PROVIDER || "nous").toLowerCase();
  return (DEFAULTS as any)[p] ? (p as AIProviderId) : "nous";
}

function getConfig(provider: AIProviderId) {
  const def = DEFAULTS[provider];
  const baseUrl = process.env.AI_BASE_URL || def.baseUrl;
  const model = process.env.AI_MODEL || def.model;
  const apiKey = process.env.AI_API_KEY || "";
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 20000);
  const tags = (process.env.AI_TAGS || "hermes-agent")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { baseUrl, model, apiKey, timeoutMs, tags };
}

function normalizeError(err: any, status?: number): AIErrorCode {
  if (status === 401 || status === 403) return "INVALID_CREDENTIAL";
  if (status === 429) return "RATE_LIMITED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status && status >= 500) return "PROVIDER_DOWN";
  if (err?.name === "AbortError" || err?.code === "ECONNABORTED") return "TIMEOUT";
  if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED") return "PROVIDER_DOWN";
  return "UNKNOWN";
}

// Map a raw provider error body to a normalized code where possible.
function classifyBody(body: any): AIErrorCode | null {
  if (!body) return null;
  const msg = String(body?.message || body?.error?.message || body?.error || "").toLowerCase();
  if (msg.includes("balance") || msg.includes("credits") || msg.includes("insufficient")) return "INSUFFICIENT_BALANCE";
  if (msg.includes("unauthorized") || msg.includes("invalid") || msg.includes("api key")) return "INVALID_CREDENTIAL";
  if (msg.includes("rate") || msg.includes("429")) return "RATE_LIMITED";
  if (msg.includes("not found") || msg.includes("does not exist")) return "MODEL_NOT_FOUND";
  return null;
}

/**
 * Call the configured AI provider. Server-side only.
 * Returns a structured result — NEVER throws to the caller with a secret inside.
 */
export async function callAI(req: AIRequest): Promise<AIResult> {
  const provider = getProvider();
  const cfg = getConfig(provider);
  const started = Date.now();

  if (!cfg.apiKey && provider !== "nous") {
    return { ok: false, text: "", provider, model: cfg.model, latencyMs: 0, errorCode: "AUTH_REQUIRED" };
  }
  if (!cfg.baseUrl) {
    return { ok: false, text: "", provider, model: cfg.model, latencyMs: 0, errorCode: "PROVIDER_DOWN" };
  }

  const messages = [
    ...(req.system ? [{ role: "system", content: req.system }] : []),
    { role: "user", content: req.prompt },
  ];

  const body: any = {
    model: cfg.model,
    messages,
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxTokens ?? 600,
  };
  if (req.json) body.response_format = { type: "json_object" };
  // Nous Portal requires portal tags on the request body.
  if (provider === "nous") body.tags = cfg.tags;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
    "User-Agent": "multicheck-app/1.0",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let parsed: any = null;
      try { parsed = await res.json(); } catch {}
      const code = classifyBody(parsed) ?? normalizeError(null, res.status);
      return { ok: false, text: "", provider, model: cfg.model, latencyMs: Date.now() - started, errorCode: code };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!text) return { ok: false, text: "", provider, model: cfg.model, latencyMs: Date.now() - started, errorCode: "BAD_RESPONSE" };
    return { ok: true, text, provider, model: cfg.model, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, text: "", provider, model: cfg.model, latencyMs: Date.now() - started, errorCode: normalizeError(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function currentAIConfig() {
  const provider = getProvider();
  const cfg = getConfig(provider);
  return { provider, model: cfg.model, baseUrl: cfg.baseUrl, hasKey: Boolean(cfg.apiKey) };
}

// Lightweight prompt-injection guard: reject obviously hostile instructions
// embedded in question/student content before it reaches the model system policy.
export function sanitizeUserContent(text: string): string {
  if (!text) return "";
  // Strip control chars and clamp length; never forward raw instructions.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").slice(0, 4000);
}
