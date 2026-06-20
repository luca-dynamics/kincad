// Single source of truth for selectable cloud models, shared by the client (selector UI) and
// the server (routing). Edit the ids/labels here to match exactly what your team key supports.

export type Provider = "anthropic" | "openai" | "google";

export interface ModelInfo {
  id: string;
  label: string;
  provider: Provider;
}

// NOTE: provider model ids change often. If a model errors with "model not found",
// update its id here to one your key supports (see each provider's models docs).
export const MODELS: ModelInfo[] = [
  // Anthropic — Claude 4.x
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic" },
  // OpenAI — GPT-5.x (current as of mid-2026); GPT-5 mini is the budget tier
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai" },
  { id: "gpt-5-mini", label: "GPT-5 mini", provider: "openai" },
  // Google — newest first; fallback chain descends to lower tiers automatically
  { id: "gemini-3-pro",      label: "Gemini 3 Pro",      provider: "google" },
  { id: "gemini-3.5-flash",  label: "Gemini 3.5 Flash",  provider: "google" },
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    provider: "google" },
  { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash",  provider: "google" },
  { id: "gemini-2.0-flash",  label: "Gemini 2 Flash",    provider: "google" },
];

/**
 * When a model hits a quota / rate-limit error, KINCAD automatically retries with
 * the next model in this chain. Keys are model ids; values are the fallback id to try.
 * The chain ends at "offline" so there is always a last resort.
 */
export const FALLBACK_CHAIN: Record<string, string> = {
  // Google — step down through tiers until something responds
  "gemini-3-pro":     "gemini-3.5-flash",
  "gemini-3.5-flash": "gemini-2.5-pro",
  "gemini-2.5-pro":   "gemini-2.5-flash",
  "gemini-2.5-flash": "gemini-2.0-flash",
  "gemini-2.0-flash": "offline",
  // Anthropic
  "claude-opus-4-8":           "claude-sonnet-4-6",
  "claude-sonnet-4-6":         "claude-haiku-4-5-20251001",
  "claude-haiku-4-5-20251001": "offline",
  // OpenAI
  "gpt-5.5":   "gpt-5.2",
  "gpt-5.2":   "gpt-5-mini",
  "gpt-5-mini": "offline",
};

/** Return the next fallback model id, or null if already at the end of the chain. */
export function nextFallback(modelId: string): string | null {
  const next = FALLBACK_CHAIN[modelId];
  return next ?? null;
}

/** True when an error message looks like a quota / rate-limit rejection. */
export function isQuotaError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("429") || m.includes("quota") || m.includes("rate_limit") ||
    m.includes("rate limit") || m.includes("resource_exhausted") || m.includes("too many requests");
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function providerOf(modelId: string): Provider | null {
  return MODELS.find((m) => m.id === modelId)?.provider ?? null;
}
