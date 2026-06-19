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
  // Google — Gemini 3.x; 3.5 Flash is the budget tier
  { id: "gemini-3-pro", label: "Gemini 3 Pro", provider: "google" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "google" },
];

export const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

export function providerOf(modelId: string): Provider | null {
  return MODELS.find((m) => m.id === modelId)?.provider ?? null;
}
