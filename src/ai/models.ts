// Registry of selectable agent models. The offline model always works; cloud models become
// available when a server key (from /api/health) OR a BYOK key is present for their provider.

import { MODELS, type Provider } from "../../shared/models";
import { OfflineAgent } from "./mock";
import { ProxyAgent } from "./proxy";
import { hasKey } from "./keys";
import type { AgentModel } from "./types";

export const OFFLINE = new OfflineAgent();
export const PROXY_AGENTS = MODELS.map((m) => new ProxyAgent(m));
export const ALL_MODELS: AgentModel[] = [...PROXY_AGENTS, OFFLINE];

let serverProviders: Record<Provider, boolean> = {
  anthropic: false,
  openai: false,
  google: false,
  agentrouter: false,
};

/** Fetch /api/health to learn which providers the server has keys for. */
export async function probeModels(): Promise<void> {
  try {
    const r = await fetch("/api/health", { headers: { Accept: "application/json" } });
    if (r.ok) {
      const d = (await r.json()) as { service?: string; providers?: Partial<Record<Provider, boolean>> };
      // Merged, not assigned: a server bundled before a provider was added omits that key, and a
      // wholesale assignment would leave `undefined` sitting behind a `boolean` type.
      if (d.service === "kincad-copilot" && d.providers) {
        serverProviders = { ...serverProviders, ...d.providers };
      }
    }
  } catch {
    /* proxy not running — cloud models stay unavailable unless BYOK */
  }
  refreshAvailability();
}

/** Recompute each model's availability (call after a BYOK key changes). */
export function refreshAvailability(): void {
  for (const a of PROXY_AGENTS) a.available = serverProviders[a.provider] || hasKey(a.provider);
}

export function serverHasProvider(p: Provider): boolean {
  return serverProviders[p];
}

export function getModel(id: string): AgentModel {
  return ALL_MODELS.find((m) => m.id === id) ?? OFFLINE;
}

// Initialise availability from any stored BYOK keys before the health probe resolves.
refreshAvailability();
