// Provider adapters. Each runs a tool-use loop with its native API but executes the SAME
// engine-grounded tools (server/tools.ts), so model choice never changes the numbers.

import { executeTool, TOOLS, type ImageKeys, type WorkingState, type WorkspaceAction } from "./tools.ts";
import { fetchWithTimeout } from "./http.ts";

export interface TurnImage {
  mime: string;
  dataUrl: string; // data:<mime>;base64,<data>
}
export interface TurnDocument {
  name: string;
  mime: string;
  kind: "pdf" | "document";
  data: string; // base64 data URL for PDFs; raw text for documents
}
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  images?: TurnImage[];
  documents?: TurnDocument[];
}

/** Split a data URL into media type + base64 payload. */
function splitDataUrl(dataUrl: string): { mime: string; data: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  return m ? { mime: m[1], data: m[2] } : { mime: "image/png", data: "" };
}
export interface RunResult {
  text: string;
  actions: WorkspaceAction[];
}

const MAX_ROUNDS = 8;

/**
 * Output ceiling per Anthropic request. Claude 5 models reason before answering by default, and
 * those thinking tokens are drawn from this same budget — so the old 1800 could be spent almost
 * entirely on reasoning and truncate the reply mid-sentence, which inside the tool loop can also
 * cut off a tool call. A ceiling is not a charge: unused tokens cost nothing. Kept well below the
 * point where the API requires a streaming request, since this loop is deliberately non-streaming
 * (see the honesty rule in src/components/chat/ActivityTrace.tsx).
 */
const MAX_TOKENS = 8000;

/**
 * Soft wall-clock budget for the whole tool loop, in ms. A serverless platform kills a function at
 * its plan/`maxDuration` limit with a bodyless 504 — mid-round, so the user gets nothing, not even
 * the CAD part the model already built. So the loop stops itself a little BEFORE that and returns
 * the actions produced so far (see `timeLimitResult`). The default leaves headroom under the 60s
 * `maxDuration` (Vercel Fluid Compute / any paid plan) to serialise and respond.
 *
 * Override with COPILOT_BUDGET_MS. Set it BELOW your real cap if you run on Vercel Hobby WITHOUT
 * Fluid Compute (~10s wall clock), where the 50s default would never fire before the platform kills
 * the function — e.g. COPILOT_BUDGET_MS=8500.
 */
const BUDGET_MS = Number(process.env.COPILOT_BUDGET_MS) || 50_000;

/**
 * Timeout for a single upstream model call, taken from the budget still remaining so no one call
 * can overrun the loop deadline. Floored so a nearly-exhausted budget still makes a genuine attempt
 * rather than aborting on arrival, and capped so the first call of a fresh budget can't monopolise
 * the whole window.
 */
function callTimeout(deadline: number): number {
  return Math.min(45_000, Math.max(6_000, deadline - Date.now()));
}

/**
 * The reply when the loop stops for time rather than because the model finished. The actions
 * gathered so far ARE returned, so whatever the model already did (set the dimensions, built the
 * part) still lands in the workspace; the text just explains the early stop without an em-dash,
 * per the project's house style.
 */
function timeLimitResult(actions: WorkspaceAction[]): RunResult {
  const text = actions.length
    ? "I stopped short of the time limit and applied the changes above. Ask me to continue and I'll pick up from here."
    : "I stopped short of the time limit before I could finish. Try a more focused request, or split it into a few steps.";
  return { text, actions };
}

// ── Anthropic (Claude) ───────────────────────────────────────────────────────
export async function runAnthropic(
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
): Promise<RunResult> {
  const actions: WorkspaceAction[] = [];
  const messages: unknown[] = history.map((m) => {
    if (m.images?.length || m.documents?.length) {
      const blocks: unknown[] = [];
      // PDF and text document blocks (before the user text so context precedes the question)
      for (const doc of m.documents ?? []) {
        if (doc.kind === "pdf") {
          const base64 = doc.data.replace(/^data:[^;]+;base64,/, "");
          blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 }, title: doc.name });
        } else {
          blocks.push({ type: "text", text: `[Attached file: ${doc.name}]\n\`\`\`\n${doc.data.slice(0, 12000)}\n\`\`\`` });
        }
      }
      blocks.push({ type: "text", text: m.content });
      for (const img of m.images ?? []) {
        const { mime, data } = splitDataUrl(img.dataUrl);
        blocks.push({ type: "image", source: { type: "base64", media_type: mime, data } });
      }
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  const deadline = Date.now() + BUDGET_MS;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    if (Date.now() > deadline) return timeLimitResult(actions);
    const res = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, messages, tools }),
      },
      callTimeout(deadline),
    );
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    // Push the assistant turn back VERBATIM. With thinking on, the reply carries signed thinking
    // blocks that the API requires unaltered on the next round of a tool loop — filtering the
    // content down to text here would make the follow-up request invalid.
    messages.push({ role: "assistant", content: data.content });
    if (data.stop_reason === "tool_use") {
      const toolResults = [];
      for (const block of data.content) {
        if (block.type === "tool_use") {
          const outcome = await executeTool(state, block.name, block.input || {}, imageKeys);
          if (outcome.action) actions.push(outcome.action);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(outcome.result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }
    const text = (data.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, actions };
  }
  return { text: "(stopped after too many tool iterations)", actions };
}

// ── OpenAI-compatible (`POST /v1/chat/completions`) ──────────────────────────
// Shared by OpenAI itself and by any gateway that speaks the same wire format (AgentRouter,
// OpenRouter, LiteLLM, One API / New API, vLLM, Ollama…). Only the base URL and the key differ,
// so the transport is written once and parameterised rather than copied per vendor — a second
// copy of this loop is a second place for the tool-result plumbing to drift.
async function runOpenAICompatible(
  vendor: string,
  baseUrl: string,
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
  /**
   * Overrides the outgoing `User-Agent`. Only set for gateways that gate on client identity —
   * AgentRouter answers `401 unauthorized_client_error` to an unrecognised agent (see
   * `runAgentRouter`). Left undefined the runtime's own agent is sent, which is the correct
   * behaviour for every first-party vendor.
   */
  userAgent?: string,
): Promise<RunResult> {
  const actions: WorkspaceAction[] = [];
  const messages: unknown[] = [
    { role: "system", content: system },
    ...history.map((m) => {
      // Prepend any document text to the user message content (GPT has no native PDF support)
      let textContent = m.content;
      for (const doc of m.documents ?? []) {
        if (doc.kind === "pdf") {
          textContent = `[PDF attached: ${doc.name} — this model cannot read PDFs directly; switch to Gemini or Claude to analyse PDF files.]\n\n` + textContent;
        } else {
          textContent = `[Attached file: ${doc.name}]\n\`\`\`\n${doc.data.slice(0, 12000)}\n\`\`\`\n\n` + textContent;
        }
      }
      if (m.images?.length) {
        const content: unknown[] = [{ type: "text", text: textContent }];
        for (const img of m.images) content.push({ type: "image_url", image_url: { url: img.dataUrl } });
        return { role: m.role, content };
      }
      return { role: m.role, content: textContent };
    }),
  ];
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const deadline = Date.now() + BUDGET_MS;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    if (Date.now() > deadline) return timeLimitResult(actions);
    const res = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(userAgent ? { "user-agent": userAgent } : {}),
        },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
      },
      callTimeout(deadline),
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      // A One API / New API gateway answers `unauthorized_client_error` when it rejects the CLIENT
      // rather than the credential. Passed through raw it reads exactly like a bad key, which sends
      // whoever hits it off to re-issue a key that was never the problem. Measured against
      // agentrouter.org with a valid key: a request carrying NO key at all draws the identical 401,
      // so the key is not consulted before the client check. Only these gateways emit this error
      // type, so keying off it cannot misfire on first-party OpenAI traffic through this same loop.
      if (detail.includes("unauthorized_client_error")) {
        throw new Error(
          `${vendor} ${res.status}: the gateway rejected the CLIENT, not the key. It only answers ` +
            `requests from an agent it recognises, and it returns this same 401 for a valid key, an ` +
            `invalid key and no key. Set AGENTROUTER_USER_AGENT to an agent the gateway authorises ` +
            `for your account. Gateway said: ${detail}`,
        );
      }
      throw new Error(`${vendor} ${res.status}: ${detail}`);
    }
    const data = await res.json();
    // A gateway can return HTTP 200 with an error envelope and no choices array. Reading
    // choices[0] blind would throw a TypeError, which surfaces to the user as a generic 502
    // instead of the vendor's actual message.
    if (!data.choices?.length) {
      const detail = data.error?.message ?? data.message ?? JSON.stringify(data).slice(0, 300);
      throw new Error(`${vendor} returned no completion: ${detail}`);
    }
    const msg = data.choices[0].message;
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* ignore malformed args */
        }
        const outcome = await executeTool(state, tc.function.name, args, imageKeys);
        if (outcome.action) actions.push(outcome.action);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(outcome.result) });
      }
      continue;
    }
    return { text: msg.content || "", actions };
  }
  return { text: "(stopped after too many tool iterations)", actions };
}

// ── OpenAI (GPT) ─────────────────────────────────────────────────────────────
export function runOpenAI(
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
): Promise<RunResult> {
  return runOpenAICompatible("openai", "https://api.openai.com/v1", model, apiKey, history, state, system, imageKeys);
}

// ── AgentRouter (third-party multi-vendor gateway) ───────────────────────────
/**
 * AgentRouter fronts several vendors' models behind one key and one OpenAI-compatible surface
 * (the deployment identifies itself as One API / New API via its `X-Oneapi-Request-Id` response
 * header, and its router returns OpenAI's `invalid_request_error` envelope).
 *
 * The base URL is overridable so the same adapter serves any other OpenAI-compatible gateway
 * without a code change. The registry id is namespaced `agentrouter/...`; `upstreamModelId`
 * strips that prefix before the request leaves, because the gateway expects the bare vendor id.
 *
 * THE GATEWAY GATES ON `User-Agent`, NOT ON THE KEY. Every `/v1/*` request carrying an
 * unrecognised agent is answered `401 {"type":"unauthorized_client_error"}` — identically for a
 * valid key, an invalid key and no key at all, which makes the response useless as a diagnostic
 * and is why this looked like a dead credential for so long. Measured against a live key:
 *
 *     POST /v1/chat/completions   UA "claude-cli/<v> (external, cli)"  -> 200, OpenAI-shaped
 *     POST /v1/chat/completions   UA "kincad/1.0" | node | curl        -> 401
 *     POST /v1/messages           UA "claude-cli/<v> (external, cli)"  -> 200, Anthropic-shaped
 *     POST /v1/messages           UA "kincad/1.0"                      -> 401
 *
 * So the wire contract below is right and the path is right; only the agent string decides. It is
 * therefore read from the environment and NOT defaulted: the only strings observed to pass name
 * other vendors' clients, and hardcoding one would ship an impersonation nobody chose and would
 * break silently the moment the gateway tightens the check. Set AGENTROUTER_USER_AGENT to whatever
 * agent AgentRouter authorises for your key.
 */
export function runAgentRouter(
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
): Promise<RunResult> {
  const baseUrl = (process.env.AGENTROUTER_BASE_URL || "https://agentrouter.org/v1").replace(/\/+$/, "");
  return runOpenAICompatible(
    "agentrouter",
    baseUrl,
    model,
    apiKey,
    history,
    state,
    system,
    imageKeys,
    process.env.AGENTROUTER_USER_AGENT,
  );
}

// ── Google (Gemini) ──────────────────────────────────────────────────────────
// Gemini's function schema needs UPPERCASE types and rejects some JSON-Schema keywords.
function geminize(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "minItems" || k === "maxItems") continue;
    if (k === "type" && typeof v === "string") out[k] = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>))
        props[pk] = geminize(pv as Record<string, unknown>);
      out[k] = props;
    } else if (k === "items" && v && typeof v === "object") {
      out[k] = geminize(v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export async function runGemini(
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
): Promise<RunResult> {
  const actions: WorkspaceAction[] = [];
  const contents: unknown[] = history.map((m) => {
    const parts: unknown[] = [];
    // Documents before the message text so context precedes the question
    for (const doc of m.documents ?? []) {
      if (doc.kind === "pdf") {
        const base64 = doc.data.replace(/^data:[^;]+;base64,/, "");
        parts.push({ inlineData: { mimeType: "application/pdf", data: base64 } });
      } else {
        parts.push({ text: `[Attached file: ${doc.name}]\n\`\`\`\n${doc.data.slice(0, 12000)}\n\`\`\`` });
      }
    }
    parts.push({ text: m.content });
    for (const img of m.images ?? []) {
      const { mime, data } = splitDataUrl(img.dataUrl);
      parts.push({ inlineData: { mimeType: mime, data } });
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const tools = [
    {
      functionDeclarations: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: geminize(t.parameters),
      })),
    },
  ];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const deadline = Date.now() + BUDGET_MS;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    if (Date.now() > deadline) return timeLimitResult(actions);
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools,
        }),
      },
      callTimeout(deadline),
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    contents.push({ role: "model", parts });
    const calls = parts.filter((p: { functionCall?: unknown }) => p.functionCall);
    if (calls.length) {
      const responseParts = [];
      for (const p of calls) {
        const fc = p.functionCall;
        const outcome = await executeTool(state, fc.name, fc.args || {}, imageKeys);
        if (outcome.action) actions.push(outcome.action);
        responseParts.push({ functionResponse: { name: fc.name, response: { result: outcome.result } } });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }
    const text = parts
      .filter((p: { text?: string }) => p.text)
      .map((p: { text: string }) => p.text)
      .join("");
    return { text, actions };
  }
  return { text: "(stopped after too many tool iterations)", actions };
}
