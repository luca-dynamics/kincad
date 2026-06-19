// Transport-agnostic backend logic, shared by the local Express server (server/index.ts) and
// the Vercel serverless functions (api/*.ts). Holds key resolution, provider routing, and the
// engine-grounded tool loop. Reads keys from process.env (local: .env; Vercel: project env).

import { MODELS, providerOf, type Provider } from "../shared/models.ts";
import { runAnthropic, runGemini, runOpenAI, type ChatTurn } from "./providers.ts";
import { buildSystemPrompt, type WorkingState } from "./tools.ts";
import { DEFAULT_FOURBAR, DEFAULT_SLIDER } from "../src/state.ts";

export function serverKey(p: Provider): string | undefined {
  if (p === "anthropic") return process.env.ANTHROPIC_API_KEY;
  if (p === "openai") return process.env.OPENAI_API_KEY;
  if (p === "google") return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  return undefined;
}

export function healthPayload() {
  return {
    service: "kincad-copilot",
    providers: {
      anthropic: !!serverKey("anthropic"),
      openai: !!serverKey("openai"),
      google: !!serverKey("google"),
    },
    models: MODELS,
  };
}

export interface CopilotBody {
  model: string;
  messages: ChatTurn[];
  context?: Partial<WorkingState> & { user?: { name?: string } };
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
  };

  const history = (messages ?? []).map((m) => ({ role: m.role, content: m.content, images: m.images }));
  const system = buildSystemPrompt(context?.user);
  const run = provider === "anthropic" ? runAnthropic : provider === "openai" ? runOpenAI : runGemini;

  try {
    const result = await run(model, key, history, state, system);
    return { status: 200, body: result };
  } catch (err) {
    return { status: 502, body: { error: (err as Error).message } };
  }
}
