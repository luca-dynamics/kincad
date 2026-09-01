// Single source of truth for selectable cloud models, shared by the client (selector UI) and
// the server (routing). Edit the ids/labels here to match exactly what your team key supports.

export type Provider = "anthropic" | "openai" | "google" | "agentrouter";

export interface ModelInfo {
  id: string;
  label: string;
  provider: Provider;
  /**
   * Whether the model appears in the picker. Omit for the normal case (listed). Set `false` to hide
   * a model from the selector while leaving it fully routable: `providerOf`, the fallback chain and
   * any saved conversation pinned to it still resolve. Used for providers we have not usably keyed
   * for the demo, so their models would otherwise render as dead, key-prompting rows. A provider
   * whose every model is unlisted drops out of the menu entirely (see ModelSelect).
   */
  listed?: boolean;
}

/**
 * Gateway model ids are namespaced with this prefix in the registry, and the prefix is stripped
 * before the request goes upstream (see `upstreamModelId`).
 *
 * This is not decoration. A gateway resells the same models the first-party providers serve, so
 * "claude-opus-5" exists BOTH as a direct Anthropic entry and as a gateway entry. `providerOf`
 * resolves a model id by first match over MODELS, so two entries sharing an id would make one of
 * them unreachable — the gateway copy would silently route to Anthropic with an Anthropic key, or
 * vice versa, depending on array order. Namespacing keeps the mapping one-to-one.
 */
export const GATEWAY_PREFIX = "agentrouter/";

// NOTE: provider model ids change often. If a model errors with "model not found",
// update its id here to one your key supports (see each provider's models docs).
export const MODELS: ModelInfo[] = [
  // Anthropic — Claude 5 family (Haiku 4.5 is the budget tier; no Haiku 5 yet). Hidden from the
  // picker (`listed: false`) until the account is funded: the key is valid but its balance is too
  // low, so every send would 400. Kept in the registry so routing, the fallback chain and any saved
  // conversation pinned to one still resolve — re-listing is deleting one flag.
  { id: "claude-opus-5", label: "Claude Opus 5", provider: "anthropic", listed: false },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic", listed: false },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic", listed: false },
  // OpenAI — GPT-5.x. Hidden until a working key is set (the current OPENAI_API_KEY is rejected
  // 401). The same env key is also read for server-side image generation, so it stays wired up;
  // this only takes the chat models out of the selector.
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai", listed: false },
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", listed: false },
  { id: "gpt-5-mini", label: "GPT-5 mini", provider: "openai", listed: false },
  // Google — only ids confirmed working against the live key are listed (probed 2026-08-31 via
  // /api/copilot). gemini-3-pro / gemini-2.5-pro / gemini-2.0-flash each returned 404 "not found /
  // no longer available", so they are omitted rather than shown and left to error on send.
  { id: "gemini-3.5-flash",  label: "Gemini 3.5 Flash",  provider: "google" },
  { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash",  provider: "google" },
  // AgentRouter — a third-party OpenAI-compatible gateway that fronts several vendors behind one
  // key. Labels are the bare model name (no "· AgentRouter" suffix): the picker already groups these
  // rows under an "AgentRouter" header, and the same-named first-party entries above are unlisted, so
  // nothing selectable collides. The namespaced id (GATEWAY_PREFIX), not the label, is what keeps
  // routing and billing pinned to the gateway.
  { id: `${GATEWAY_PREFIX}claude-opus-5`,   label: "Claude Opus 5",   provider: "agentrouter" },
  { id: `${GATEWAY_PREFIX}claude-opus-4-8`, label: "Claude Opus 4.8", provider: "agentrouter" },
  { id: `${GATEWAY_PREFIX}gpt-5.6-sol`,     label: "GPT-5.6 Sol",     provider: "agentrouter" },
];

/** The id to send upstream: registry ids are namespaced, provider APIs expect the bare id. */
export function upstreamModelId(modelId: string): string {
  return modelId.startsWith(GATEWAY_PREFIX) ? modelId.slice(GATEWAY_PREFIX.length) : modelId;
}

/**
 * When a model hits a quota / rate-limit error, KINCAD automatically retries with
 * the next model in this chain. Keys are model ids; values are the fallback id to try.
 * The chain ends at "offline" so there is always a last resort.
 */
export const FALLBACK_CHAIN: Record<string, string> = {
  // Google — step down through the working tiers until something responds
  "gemini-3.5-flash": "gemini-2.5-flash",
  "gemini-2.5-flash": "offline",
  // Anthropic
  "claude-opus-5":             "claude-sonnet-5",
  "claude-sonnet-5":           "claude-haiku-4-5-20251001",
  "claude-haiku-4-5-20251001": "offline",
  // OpenAI
  "gpt-5.5":   "gpt-5.2",
  "gpt-5.2":   "gpt-5-mini",
  "gpt-5-mini": "offline",
  // AgentRouter — stays inside the gateway rather than falling back to a first-party model, so a
  // quota error never silently moves the request (and the key it is billed to) to another vendor.
  [`${GATEWAY_PREFIX}claude-opus-5`]:   `${GATEWAY_PREFIX}claude-opus-4-8`,
  [`${GATEWAY_PREFIX}claude-opus-4-8`]: `${GATEWAY_PREFIX}gpt-5.6-sol`,
  [`${GATEWAY_PREFIX}gpt-5.6-sol`]:     "offline",
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
  agentrouter: "AgentRouter",
};

export function providerOf(modelId: string): Provider | null {
  return MODELS.find((m) => m.id === modelId)?.provider ?? null;
}
