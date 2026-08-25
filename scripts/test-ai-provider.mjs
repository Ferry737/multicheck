import { callAI, currentAIConfig } from "/opt/data/projects/multicheck/lib/ai/provider.ts";

const TOKEN = process.env.AI_API_KEY || "";
console.log("config:", JSON.stringify(currentAIConfig()));
console.log("has key:", TOKEN.length > 0);

const res = await callAI({
  system: "Antworte knapp auf Deutsch.",
  prompt: "Erkläre 10% von 200 mit einem kurzen Beispiel.",
  maxTokens: 200,
});
console.log("RESULT ok:", res.ok, "provider:", res.provider, "model:", res.model, "latency:", res.latencyMs);
if (res.ok) console.log("TEXT:", res.text.slice(0, 200));
else console.log("ERROR:", res.errorCode);
