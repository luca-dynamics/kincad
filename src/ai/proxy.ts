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
          images: m.attachments?.map((a) => ({ mime: a.mime, dataUrl: a.dataUrl })),
        })),
        context: { kind: ctx.kind, fourbar: ctx.fourbar, slider: ctx.slider, user: ctx.user },
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
