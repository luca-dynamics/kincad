// Invariants of the model registry (shared/models.ts).
//
// These are cheap assertions about a table of string literals, which normally would not be worth
// testing. They exist because the table is resolved by SEARCH, not by key: `providerOf` is
// `MODELS.find(m => m.id === id)?.provider`, so it returns the FIRST match. A gateway resells the
// same models the first-party providers serve, so the moment two entries share an id, one of them
// becomes unreachable — every request for it is routed to the other one's provider and signed with
// the other one's key. Nothing in the type system prevents that, and nothing at runtime complains;
// the symptom is "I selected the gateway model and my Anthropic key got billed."
//
// Hence: gateway ids are namespaced in the registry and stripped at egress by `upstreamModelId`.
// The tests below pin that scheme, the totality of the provider tables, and the integrity of the
// fallback chain (whose values are plain strings and so can name a model that does not exist).

import { describe, it, expect } from "vitest";
import {
  FALLBACK_CHAIN,
  GATEWAY_PREFIX,
  MODELS,
  PROVIDER_LABEL,
  nextFallback,
  providerOf,
  upstreamModelId,
  type Provider,
} from "../../../shared/models";

const ids = MODELS.map((m) => m.id);
const gateway = MODELS.filter((m) => m.provider === "agentrouter");
const firstParty = MODELS.filter((m) => m.provider !== "agentrouter");

describe("model ids are unique", () => {
  it("no id appears twice", () => {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("every id resolves to its own declared provider", () => {
    // This is the assertion a duplicate id breaks: `find` would hand the second entry's traffic to
    // the first entry's provider.
    for (const m of MODELS) expect(providerOf(m.id)).toBe(m.provider);
  });

  it("an unknown id resolves to null rather than a default provider", () => {
    expect(providerOf("claude-opus-9")).toBeNull();
    expect(providerOf("")).toBeNull();
  });
});

describe("gateway ids are namespaced and stripped at egress", () => {
  it("every gateway model is prefixed and every first-party model is not", () => {
    expect(gateway.length).toBeGreaterThan(0);
    for (const m of gateway) expect(m.id.startsWith(GATEWAY_PREFIX)).toBe(true);
    for (const m of firstParty) expect(m.id.startsWith(GATEWAY_PREFIX)).toBe(false);
  });

  it("upstreamModelId is the identity on first-party ids", () => {
    for (const m of firstParty) expect(upstreamModelId(m.id)).toBe(m.id);
  });

  it("upstreamModelId strips exactly one prefix and leaves a non-empty vendor id", () => {
    for (const m of gateway) {
      const bare = upstreamModelId(m.id);
      expect(bare).toBe(m.id.slice(GATEWAY_PREFIX.length));
      expect(bare.length).toBeGreaterThan(0);
      expect(bare.startsWith(GATEWAY_PREFIX)).toBe(false);
    }
  });

  it("demonstrates the collision the prefix prevents", () => {
    // The gateway sells Claude Opus 5, and so does Anthropic. The registry id routes to the
    // gateway; the id that actually goes on the wire is the bare vendor name, which — if it were
    // used as the registry id — would resolve to Anthropic instead. Both halves matter: the first
    // keeps routing correct, the second keeps the upstream request valid.
    const viaGateway = `${GATEWAY_PREFIX}claude-opus-5`;
    expect(providerOf(viaGateway)).toBe("agentrouter");
    expect(providerOf(upstreamModelId(viaGateway))).toBe("anthropic");
    expect(upstreamModelId(viaGateway)).toBe("claude-opus-5");
  });

  it("gateway labels are the bare model name, not suffixed with the provider", () => {
    // The picker groups these rows under an "AgentRouter" header and the same-named first-party
    // entries are unlisted, so the label needs no "· AgentRouter" suffix — the namespaced id, not
    // the label, is what pins routing and billing to the gateway. (A redundant suffix also crowded
    // the composer's send button on narrow screens.)
    for (const m of gateway) expect(m.label).not.toContain("AgentRouter");
  });
});

describe("provider tables are total", () => {
  const providers = Object.keys(PROVIDER_LABEL) as Provider[];

  it("every provider has a non-empty display label", () => {
    for (const p of providers) expect(PROVIDER_LABEL[p]).toBeTruthy();
  });

  it("every provider has at least one model", () => {
    // Keep every declared provider backed by a model. The menu now skips a provider whose models
    // are all unlisted (see the "picker listing" block below and ModelSelect), but a provider with
    // no models at all is a label that buys nothing and only muddies providerOf and the tables.
    for (const p of providers) {
      expect(MODELS.filter((m) => m.provider === p).length).toBeGreaterThan(0);
    }
  });

  it("every model's provider is one the label table knows", () => {
    for (const m of MODELS) expect(providers).toContain(m.provider);
  });

  // The matching "every provider has a backend adapter" check lives in server/__tests__/gateway.
  // test.ts — importing server/handler.ts from here would pull the backend into tsconfig.app.json,
  // which has no Node types.
});

describe("fallback chain integrity", () => {
  it("every key and every value names a real model (or ends the chain)", () => {
    for (const [from, to] of Object.entries(FALLBACK_CHAIN)) {
      expect(ids, `fallback source ${from}`).toContain(from);
      if (to !== "offline") expect(ids, `fallback target ${to}`).toContain(to);
    }
  });

  it("terminates from every model without cycling", () => {
    for (const m of MODELS) {
      const seen = new Set<string>([m.id]);
      let cur: string | null = m.id;
      let hops = 0;
      while (cur && cur !== "offline") {
        const next: string | null = nextFallback(cur);
        if (next === null) break; // no entry: this model simply has no fallback
        expect(seen.has(next), `cycle in fallback chain at ${next}`).toBe(false);
        seen.add(next);
        cur = next;
        expect(++hops).toBeLessThan(MODELS.length + 2);
      }
    }
  });

  it("never falls back across providers", () => {
    // Policy, not an accident. A quota error is a billing-neutral retry only while it stays with
    // the same key; hopping to another vendor would move both the request and the charge to a
    // provider the user did not pick — and for the gateway, out of the gateway entirely.
    for (const [from, to] of Object.entries(FALLBACK_CHAIN)) {
      if (to === "offline") continue;
      expect(providerOf(to), `${from} -> ${to}`).toBe(providerOf(from));
    }
  });

  it("every provider's chain reaches offline, so no provider can dead-end", () => {
    for (const p of Object.keys(PROVIDER_LABEL) as Provider[]) {
      const top = MODELS.find((m) => m.provider === p)!;
      let cur: string | null = top.id;
      const path: string[] = [top.id];
      while (cur && nextFallback(cur)) {
        cur = nextFallback(cur);
        path.push(cur!);
      }
      expect(path[path.length - 1], `${p} chain: ${path.join(" -> ")}`).toBe("offline");
    }
  });
});

describe("picker listing", () => {
  it("unlisted models stay routable — only their visibility changes", () => {
    // `listed: false` hides a model from the selector; it must NOT drop out of routing, or a saved
    // conversation pinned to it would come back as an unknown model and 400 on the next send.
    const unlisted = MODELS.filter((m) => m.listed === false);
    expect(unlisted.length).toBeGreaterThan(0);
    for (const m of unlisted) expect(providerOf(m.id)).toBe(m.provider);
  });

  it("shows only providers that have a listed model, hiding the rest", () => {
    // ModelSelect draws a provider's section only when it has ≥1 listed model, so a provider we
    // have not usably keyed vanishes instead of rendering an empty, key-prompting box. Anthropic
    // (no credit) and OpenAI (rejected key) are hidden for the demo; Google and the gateway remain.
    const shown = (Object.keys(PROVIDER_LABEL) as Provider[]).filter((p) =>
      MODELS.some((m) => m.provider === p && m.listed !== false),
    );
    expect(shown).toContain("google");
    expect(shown).toContain("agentrouter");
    expect(shown).not.toContain("anthropic");
    expect(shown).not.toContain("openai");
  });
});
