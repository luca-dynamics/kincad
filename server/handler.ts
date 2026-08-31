// Transport-agnostic backend logic, shared by the local Express server (server/index.ts) and
// the Vercel serverless functions (api/*.ts). Holds key resolution, provider routing, and the
// engine-grounded tool loop. Reads keys from process.env (local: .env; Vercel: project env).

import { MODELS, providerOf, isQuotaError, upstreamModelId, type Provider } from "../shared/models.ts";
import { runAgentRouter, runAnthropic, runGemini, runOpenAI, type ChatTurn } from "./providers.ts";
import { buildSystemPrompt, type WorkingState } from "./tools.ts";
import { DEFAULT_FOURBAR, DEFAULT_OMEGA2, DEFAULT_SLIDER } from "../src/state.ts";
import { DEFAULT_UNIT } from "../src/units.ts";

export function serverKey(p: Provider): string | undefined {
  if (p === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (p === "openai") return process.env.OPENAI_API_KEY;
  if (p === "google") return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (p === "agentrouter") return process.env.AGENTROUTER_API_KEY;
  return undefined;
}

/**
 * Is the gateway actually usable, not merely keyed?
 *
 * agentrouter.org gates on client identity before it looks at the credential: every request whose
 * agent it does not recognise draws `401 unauthorized_client_error`, and a request with no key at
 * all draws the same one (measured). So a key on its own is not readiness, and reporting it as
 * readiness is worse than reporting nothing — it lights the three gateway models up in the selector
 * and walks the user into a 401 that names the wrong cause.
 *
 * A different OpenAI-compatible gateway behind AGENTROUTER_BASE_URL (OpenRouter, LiteLLM, One API…)
 * authenticates on the key alone, so pointing away from agentrouter.org is readiness by itself.
 */
export function agentRouterReady(): boolean {
  if (!serverKey("agentrouter")) return false;
  const base = process.env.AGENTROUTER_BASE_URL?.trim();
  const atDefaultHost = !base || /(^|\/\/)([^/]*\.)?agentrouter\.org(\/|$|:)/i.test(base);
  return atDefaultHost ? !!process.env.AGENTROUTER_USER_AGENT?.trim() : true;
}

export function healthPayload() {
  return {
    service: "kincad-copilot",
    providers: {
      anthropic: !!serverKey("anthropic"),
      openai: !!serverKey("openai"),
      google: !!serverKey("google"),
      agentrouter: agentRouterReady(),
    },
    models: MODELS,
  };
}

/**
 * Provider → adapter, written as a total `Record<Provider, …>` rather than a chain of ternaries:
 * the old `p === "anthropic" ? … : p === "openai" ? … : runGemini` sent ANY unhandled provider's
 * traffic to Gemini, signed with that provider's key. A missing entry here is now visible instead
 * of silently misrouted.
 *
 * Exported for the totality check in server/__tests__/gateway.test.ts. That test, not the compiler,
 * is what enforces it: `server/` is not part of any tsconfig `include`, so nothing here is
 * type-checked by `tsc -b` (see the note in tsconfig.node.json).
 */
export const RUNNERS: Record<Provider, typeof runAnthropic> = {
  anthropic: runAnthropic,
  openai: runOpenAI,
  google: runGemini,
  agentrouter: runAgentRouter,
};

export interface CopilotBody {
  model: string;
  messages: ChatTurn[];
  context?: Partial<WorkingState> & { user?: { name?: string }; approvalRequired?: boolean };
  apiKey?: string; // BYOK
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export async function runCopilot(body: CopilotBody): Promise<HandlerResult> {
  const { model, messages, context, apiKey } = body ?? ({} as CopilotBody);
  const provider = providerOf(model);
  if (!provider) return { status: 400, body: { error: `Unknown model: ${model}` } };

  const key = apiKey?.trim() || serverKey(provider);
  if (!key)
    return {
      status: 400,
      body: {
        error: `No API key for ${provider}. Add it in the model menu (BYOK) or set it in the server environment.`,
      },
    };

  const state: WorkingState = {
    kind: context?.kind ?? "fourbar",
    fourbar: context?.fourbar ?? DEFAULT_FOURBAR,
    slider: context?.slider ?? DEFAULT_SLIDER,
    // Falls back to the workspace default rather than the engine's unit-rate 1 rad/s: a client that
    // sends no speed is still a client running the app at its default speed.
    omega2: context?.omega2 ?? DEFAULT_OMEGA2,
    // Same fallback reasoning: a client that declares no unit is a client running at the app's
    // default declaration, so the prompt states that rather than leaving the unit unnamed.
    unit: context?.unit ?? DEFAULT_UNIT,
  };

  const history = (messages ?? []).map((m) => ({ role: m.role, content: m.content, images: m.images, documents: m.documents }));
  const system = buildSystemPrompt({
    user: context?.user,
    approvalRequired: context?.approvalRequired,
    // Read off the state built above, not off `context` again — that way the unit the prompt
    // declares is the same one the tools operate under, even when both are defaulted.
    unit: state.unit,
  });
  const run = RUNNERS[provider];
  // Always pass both image keys so generate_image works regardless of which text model is active.
  const imageKeys = { googleKey: serverKey("google"), openAIKey: serverKey("openai") };

  try {
    // Gateway ids are namespaced in the registry (`agentrouter/claude-opus-5`) so they cannot
    // collide with the first-party entry for the same model; the upstream API wants the bare id.
    const result = await run(upstreamModelId(model), key, history, state, system, imageKeys);
    return { status: 200, body: result };
  } catch (err) {
    const msg = (err as Error).message;
    // Surface quota/rate-limit errors with a distinct status so the client can
    // automatically fall back to a lower-tier model without user intervention.
    if (isQuotaError(msg)) return { status: 429, body: { error: msg, quota: true } };
    return { status: 502, body: { error: msg } };
  }
}
