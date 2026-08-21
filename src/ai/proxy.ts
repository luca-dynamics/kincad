// Provider-agnostic agent that talks to the local proxy (server/). The proxy routes by model
// id to the right provider and runs the engine-grounded tool loop. Works for Claude, GPT and
// Gemini alike — the only difference is the model id and which key is present.

import type { ModelInfo, Provider } from "../../shared/models";
import { getKey } from "./keys";
import type { AgentContext, AgentModel, AgentReply, ChatMessage } from "./types";

/** Thrown when the provider returns a quota / rate-limit rejection (HTTP 429). */
export class QuotaError extends Error {
  readonly modelId: string;
  constructor(message: string, modelId: string) {
    super(message);
    this.name = "QuotaError";
    this.modelId = modelId;
  }
}

export class ProxyAgent implements AgentModel {
  readonly id: string;
  readonly label: string;
  readonly provider: Provider;
  available = false; // set by the registry from /api/health + BYOK presence
  private endpoint: string;

  constructor(info: ModelInfo, endpoint = "/api/copilot") {
    this.id = info.id;
    this.label = info.label;
    this.provider = info.provider;
    this.endpoint = endpoint;
  }

  async respond(messages: ChatMessage[], ctx: AgentContext): Promise<AgentReply> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.id,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.attachments
            ?.filter((a) => (a.kind ?? "image") === "image")
            .map((a) => ({ mime: a.mime, dataUrl: a.dataUrl! })),
          documents: m.attachments
            ?.filter((a) => a.kind === "pdf" || a.kind === "document")
            .map((a) => ({ name: a.name, mime: a.mime, kind: a.kind, data: a.dataUrl ?? a.text ?? "" })),
        })),
        context: {
          kind: ctx.kind,
          fourbar: ctx.fourbar,
          slider: ctx.slider,
          // The speed has to reach the server's `analyze` tool: ω₄ scales with ω₂ and α₄ with its
          // square, so without it the model quotes figures the user's own screen contradicts.
          omega2: ctx.omega2,
          // And so does the declared length unit — the geometry above is unitless, so this is the
          // only thing that stops the model naming a unit of its own choosing for it.
          unit: ctx.unit,
          user: ctx.user,
          // The mode has to reach the prompt: whether a tool call is a change or a proposal
          // decides how the reply should be worded.
          approvalRequired: ctx.approvalRequired,
        },
        apiKey: getKey(this.provider), // BYOK; undefined falls back to the server key
      }),
    });
    if (!res.ok) {
      let detail = "";
      let quota = false;
      try {
        const body = await res.json();
        detail = body.error ?? "";
        quota = !!body.quota;
      } catch {
        detail = await res.text().catch(() => "");
      }
      const msg = detail || `proxy error ${res.status}`;
      if (res.status === 429 || quota) throw new QuotaError(msg, this.id);
      throw new Error(msg);
    }
    const data = (await res.json()) as AgentReply;
    return { text: data.text, actions: data.actions ?? [] };
  }
}
