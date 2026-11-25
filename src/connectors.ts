// Every outbound call goes through the Sprites gateway. This file holds connector IDs,
// never credentials: the gateway attaches the token after checking the calling Sprite's
// identity and the connector's path allow-list.
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const GW = "https://api.sprites.dev/v1/gateway";
export const GITHUB = process.env.HEIR_GITHUB_CONN ?? "FlNWPaQnDQyGg4tU_qOByA"; // custom_api -> api.github.com
export const OPENROUTER = process.env.HEIR_OPENROUTER_CONN ?? "Ep61ypKQlm0bfCrz1WMHMQ"; // openrouter api_key
export const MODEL = process.env.HEIR_MODEL ?? "openai/gpt-4o-mini";
// Drafting a gate is code-writing; the cheap model copies the example gate's blind spot (measured 3/3 on 2026-11-25; gpt-4.1 passed 0 of 15 drafts the same day).
export const DRAFT_MODEL = process.env.HEIR_DRAFT_MODEL ?? "anthropic/claude-sonnet-5.5";

// Client-side circuit breaker. Not a guarantee: the OpenRouter key behind the connector also
// carries a provider-side $1 limit, which is the one that actually binds.
export const CAP_USD = 1.0;
export const LEDGER = join(import.meta.dir, "..", "ledger.jsonl");

export function spentUsd(): number {
  if (!existsSync(LEDGER)) return 0;
  return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost_usd ?? 0), 0);
}

export async function chat(messages: { role: string; content: string }[], model = MODEL): Promise<string> {
  const spent = spentUsd();
  if (!(spent < CAP_USD)) throw new Error(`circuit breaker: $${spent.toFixed(4)} spent of $${CAP_USD.toFixed(2)} cap`);
  const r = await fetch(`${GW}/openrouter/${OPENROUTER}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.7, ...(model === MODEL ? { max_tokens: 400 } : { max_tokens: 5000, reasoning: { max_tokens: 1500 } }), usage: { include: true } }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`openrouter via gateway ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), model, tokens: j.usage?.total_tokens, cost_usd: j.usage?.cost ?? 0 }) + "\n");
  const out = j.choices?.[0]?.message?.content ?? "";
  if (!out) console.error(`empty reply from ${model}: finish_reason=${j.choices?.[0]?.finish_reason} ${JSON.stringify(j.choices?.[0]?.message ?? j).slice(0, 300)}`);
  return out;
}

export async function github(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const r = await fetch(`${GW}/custom_api/${GITHUB}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/vnd.github+json", "User-Agent": "heir (AI agent, child of Pico; github.com/piiiico/heir)" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, text: await r.text() };
}
