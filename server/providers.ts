// Provider adapters. Each runs a tool-use loop with its native API but executes the SAME
// engine-grounded tools (server/tools.ts), so model choice never changes the numbers.

import { executeTool, TOOLS, type ImageKeys, type WorkingState, type WorkspaceAction } from "./tools.ts";

export interface TurnImage {
  mime: string;
  dataUrl: string; // data:<mime>;base64,<data>
}
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  images?: TurnImage[];
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
    if (m.images?.length) {
      const blocks: unknown[] = [{ type: "text", text: m.content }];
      for (const img of m.images) {
        const { mime, data } = splitDataUrl(img.dataUrl);
        blocks.push({ type: "image", source: { type: "base64", media_type: mime, data } });
      }
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 1800, system, messages, tools }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
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

// ── OpenAI (GPT) ─────────────────────────────────────────────────────────────
export async function runOpenAI(
  model: string,
  apiKey: string,
  history: ChatTurn[],
  state: WorkingState,
  system: string,
  imageKeys?: ImageKeys,
): Promise<RunResult> {
  const actions: WorkspaceAction[] = [];
  const messages: unknown[] = [
    { role: "system", content: system },
    ...history.map((m) => {
      if (m.images?.length) {
        const content: unknown[] = [{ type: "text", text: m.content }];
        for (const img of m.images) content.push({ type: "image_url", image_url: { url: img.dataUrl } });
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    }),
  ];
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
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
    const parts: unknown[] = [{ text: m.content }];
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

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools,
      }),
    });
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
