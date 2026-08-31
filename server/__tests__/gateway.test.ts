// The request KINCAD actually puts on the wire for each provider — asserted by intercepting fetch.
//
// Everything here exists because provider dispatch has no compiler covering it. `server/` is
// outside every tsconfig `include` (see the note in tsconfig.node.json), so nothing in the backend
// is type-checked; and the parts that would matter most are not the sort of thing types catch
// anyway. Two specific failure modes motivated these tests:
//
//   1. WRONG VENDOR, RIGHT-LOOKING REQUEST. `providerOf` resolves a model id by `MODELS.find`, so
//      it returns the FIRST match. The AgentRouter gateway resells "claude-opus-5", which Anthropic
//      also serves. If both were registered under the same id, selecting one would send the request
//      to the other's endpoint signed with the other's key — a 200 OK, a plausible answer, and a
//      charge on the wrong account. The registry namespaces gateway ids to prevent it; these tests
//      pin that the namespace is used for ROUTING and stripped before EGRESS.
//   2. SILENT FALL-THROUGH. Dispatch used to be a ternary chain ending in `runGemini`, so any
//      provider without an explicit branch was sent to Google. RUNNERS is now a total record, and
//      the totality is asserted below because no compiler is checking it here.
//
// The stub returns real `Response` objects rather than a hand-rolled shape, so `res.ok`,
// `res.status`, `res.json()` and `res.text()` behave as the adapters expect.

import { describe, it, expect, vi, afterEach } from "vitest";
import { PROVIDER_LABEL, type Provider } from "../../shared/models.ts";
import { RUNNERS, healthPayload, runCopilot } from "../handler.ts";

const KEY = "sk-test-gateway-key";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: {
    model?: string;
    messages?: { role: string; content: unknown }[];
    tools?: { type?: string; function?: { name?: string; parameters?: unknown } }[];
  };
}

/**
 * Install a fetch that records every request and replies with `script[n]` for the nth call.
 * A script entry of `null` means "reply with a plain text completion".
 */
function stubFetch(script: (unknown | null)[]): Sent[] {
  const sent: Sent[] = [];
  let n = 0;
  vi.stubGlobal("fetch", async (input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    sent.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(init.body) : {},
    });
    const entry = script[Math.min(n++, script.length - 1)];
    const payload = entry ?? { choices: [{ message: { role: "assistant", content: "done" } }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  });
  return sent;
}

const openAIToolCall = (name: string, args: unknown) => ({
  choices: [
    {
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } }],
      },
    },
  ],
});

const ask = (model: string, content = "Set a four-bar with ground 6, input 2, coupler 7.8, output 7.") =>
  runCopilot({ model, messages: [{ role: "user", content }] });

const ENV_KEYS = [
  "AGENTROUTER_API_KEY",
  "AGENTROUTER_BASE_URL",
  "AGENTROUTER_USER_AGENT",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("every provider is dispatchable", () => {
  it("RUNNERS is total over the registry's providers, and holds nothing else", () => {
    const providers = Object.keys(PROVIDER_LABEL) as Provider[];
    for (const p of providers) expect(typeof RUNNERS[p], `no adapter for ${p}`).toBe("function");
    expect(Object.keys(RUNNERS).sort()).toEqual([...providers].sort());
  });
});

describe("AgentRouter gateway requests", () => {
  it("goes to the gateway's endpoint, not to the vendor whose model it names", () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    return ask("agentrouter/gpt-5.6-sol").then((res) => {
      expect(res.status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe("https://agentrouter.org/v1/chat/completions");
      expect(sent[0].url).not.toContain("api.openai.com");
    });
  });

  it("strips the registry namespace before the id leaves", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    // The whole point of the prefix: it routes here, and it must not go upstream, where it would be
    // an unknown model.
    expect(sent[0].body.model).toBe("claude-opus-5");
  });

  it("authenticates with AGENTROUTER_API_KEY as a bearer token", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    expect(sent[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    // Not the Anthropic scheme, even though the model is a Claude model.
    expect(sent[0].headers["x-api-key"]).toBeUndefined();
  });

  it("prefers a BYOK key over the server key", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    await runCopilot({
      model: "agentrouter/claude-opus-5",
      messages: [{ role: "user", content: "hi" }],
      apiKey: "sk-byok",
    });
    expect(sent[0].headers.Authorization).toBe("Bearer sk-byok");
  });

  it("honours AGENTROUTER_BASE_URL, trailing slashes and all", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    process.env.AGENTROUTER_BASE_URL = "https://gateway.internal/v1//";
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    expect(sent[0].url).toBe("https://gateway.internal/v1/chat/completions");
  });

  // AgentRouter gates on `User-Agent`, not on the key: any agent it does not recognise gets
  // `401 unauthorized_client_error` — identically for a valid key, an invalid key and no key at
  // all, so the response cannot tell you which it is. The agent string is therefore configuration,
  // and these two tests pin both halves of that.
  it("sends AGENTROUTER_USER_AGENT when the gateway requires a named client", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    process.env.AGENTROUTER_USER_AGENT = "some-authorised-agent/1.0";
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    expect(sent[0].headers["user-agent"]).toBe("some-authorised-agent/1.0");
  });

  it("sends NO User-Agent override when unset, rather than defaulting to someone else's client", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    delete process.env.AGENTROUTER_USER_AGENT;
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    // Absent, not empty-string: an empty header would itself be an unrecognised agent, and a
    // hardcoded default would ship an impersonation the operator never chose.
    expect(sent[0].headers["user-agent"]).toBeUndefined();
    expect(Object.keys(sent[0].headers).map((h) => h.toLowerCase())).not.toContain("user-agent");
  });

  it("offers the engine tools in OpenAI function shape", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    await ask("agentrouter/claude-opus-5");
    const tools = sent[0].body.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.type).toBe("function");
      expect(t.function?.name).toBeTruthy();
      expect(t.function?.parameters).toBeTruthy();
    }
    expect(tools.map((t) => t.function?.name)).toContain("analyze");
  });

  it("runs the tool loop against the real engine and returns its actions", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([
      openAIToolCall("set_fourbar", { ground: 6, input: 2, coupler: 7.8, output: 7 }),
      openAIToolCall("analyze", {}),
      null,
    ]);
    const res = await ask("agentrouter/claude-opus-5");
    const body = res.body as { text: string; actions: { type: string }[] };

    expect(sent).toHaveLength(3);
    expect(body.actions.map((a) => a.type)).toEqual(["set_fourbar", "run_analysis"]);

    // The tool results are fed back as role:"tool" messages carrying REAL engine output — the
    // grounding rule the whole app rests on. A gateway that only echoed text would fail here.
    const toolMsgs = (sent[2].body.messages ?? []).filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    const report = JSON.parse(String(toolMsgs[1].content));
    expect(report.grashof.type).toBe("crank-rocker");
    expect(report.reachableArcDeg).toBe(360);
    expect(report.transmission.min.value).toBeGreaterThan(0);
  });
});

describe("gateway wiring cannot bleed into the first-party providers", () => {
  it("the direct Anthropic model still uses Anthropic's endpoint and auth scheme", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const sent = stubFetch([{ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" }]);
    const res = await ask("claude-opus-5");
    expect(res.status).toBe(200);
    expect(sent[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0].headers["x-api-key"]).toBe("sk-ant-test");
    expect(sent[0].headers.Authorization).toBeUndefined();
    expect(sent[0].body.model).toBe("claude-opus-5");
  });

  it("the direct OpenAI model still uses OpenAI's endpoint", async () => {
    process.env.OPENAI_API_KEY = "sk-oai-test";
    const sent = stubFetch([null]);
    await ask("gpt-5.5");
    expect(sent[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent[0].headers.Authorization).toBe("Bearer sk-oai-test");
  });

  it("the gateway's User-Agent never rides along on first-party OpenAI traffic", async () => {
    // Both providers share `runOpenAICompatible`, so the agent override has to be a per-call
    // argument rather than something the transport reads from the environment itself. OpenAI does
    // not gate on client identity, and announcing a gateway's authorised agent to a vendor that
    // never asked for one would be a lie sent for no reason.
    process.env.OPENAI_API_KEY = "sk-oai-test";
    process.env.AGENTROUTER_USER_AGENT = "some-authorised-agent/1.0";
    const sent = stubFetch([null]);
    await ask("gpt-5.5");
    expect(sent[0].headers["user-agent"]).toBeUndefined();
  });

  it("a gateway key does not unlock the first-party model of the same name", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AGENTROUTER_API_KEY = KEY;
    const sent = stubFetch([null]);
    const res = await ask("claude-opus-5");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("anthropic");
    expect(sent).toHaveLength(0); // never left the process
  });
});

describe("failure modes are reported, not swallowed", () => {
  it("a missing key is refused before any upstream call", async () => {
    delete process.env.AGENTROUTER_API_KEY;
    const sent = stubFetch([null]);
    const res = await ask("agentrouter/claude-opus-5");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("agentrouter");
    expect(sent).toHaveLength(0);
  });

  it("an unknown model id is rejected rather than guessed at", async () => {
    const sent = stubFetch([null]);
    // Looks like a gateway model, is not one. Must not fall through to a default provider.
    const res = await ask("claude-opus-5-via-agentrouter");
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("Unknown model");
    expect(sent).toHaveLength(0);
  });

  it("an HTTP 200 carrying an error envelope surfaces the vendor's message", async () => {
    // One API / New API gateways answer 200 with `{error:{…}}` and no `choices` when they have no
    // upstream channel for a model. Reading `choices[0]` blind would throw a TypeError and reach the
    // user as a bare 502 with none of the explanation.
    process.env.AGENTROUTER_API_KEY = KEY;
    stubFetch([{ error: { message: "no channel available for model", type: "new_api_error" } }]);
    const res = await ask("agentrouter/gpt-5.6-sol");
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).toContain("no channel available for model");
    expect(JSON.stringify(res.body)).not.toContain("undefined");
  });

  it("a rate limit is flagged as a quota error so the client can fall back", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    vi.stubGlobal("fetch", async () => new Response("rate_limit_exceeded", { status: 429 }));
    const res = await ask("agentrouter/claude-opus-5");
    expect(res.status).toBe(429);
    expect((res.body as { quota?: boolean }).quota).toBe(true);
  });

  // The gateway's own reply to a client it does not recognise. Verbatim from agentrouter.org.
  const CLIENT_REJECTED = JSON.stringify({
    error: { message: "unauthorized client detected, contact support for assistance at https://discord.gg/aYq5B4RW3" },
    message: "UNAUTHENTICATED",
    success: false,
    type: "unauthorized_client_error",
  });

  it("explains a client rejection instead of passing off a 401 that reads like a bad key", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    vi.stubGlobal("fetch", async () => new Response(CLIENT_REJECTED, { status: 401 }));
    const res = await ask("agentrouter/claude-opus-5");
    const text = JSON.stringify(res.body);

    expect(res.status).toBe(502);
    // Names the real cause and the lever that fixes it...
    expect(text).toContain("rejected the CLIENT, not the key");
    expect(text).toContain("AGENTROUTER_USER_AGENT");
    // ...and still carries the gateway's own words, including where it says to go.
    expect(text).toContain("unauthorized client detected");
    expect(text).toContain("discord.gg");
  });

  it("does not mistake a client rejection for a quota error and retry down the chain", async () => {
    // isQuotaError matches on substrings, so the rewritten message must not introduce one. A
    // client rejection is not transient and every fallback would hit the identical gate.
    process.env.AGENTROUTER_API_KEY = KEY;
    vi.stubGlobal("fetch", async () => new Response(CLIENT_REJECTED, { status: 401 }));
    const res = await ask("agentrouter/claude-opus-5");
    expect(res.status).not.toBe(429);
    expect((res.body as { quota?: boolean }).quota).toBeUndefined();
  });

  it("leaves an ordinary 401 alone rather than blaming the client gate for it", async () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ error: { message: "invalid api key", type: "invalid_request_error" } }), { status: 401 }),
    );
    const res = await ask("agentrouter/claude-opus-5");
    const text = JSON.stringify(res.body);
    expect(text).toContain("invalid api key");
    expect(text).not.toContain("AGENTROUTER_USER_AGENT");
  });
});

describe("health reporting", () => {
  // Readiness is not key-presence. The gateway checks the client BEFORE the credential, so a key
  // with no authorised agent is a provider that will 401 on first use — and reporting it as ready
  // lights its three models up in the selector and sends the user into that 401.
  it("a key alone is not ready, because the client gate has not been satisfied", () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    delete process.env.AGENTROUTER_USER_AGENT;
    delete process.env.AGENTROUTER_BASE_URL;
    expect(healthPayload().providers.agentrouter).toBe(false);
  });

  it("key plus an authorised agent is ready", () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    process.env.AGENTROUTER_USER_AGENT = "some-authorised-agent/1.0";
    expect(healthPayload().providers.agentrouter).toBe(true);
  });

  it("an agent without a key is still not ready", () => {
    delete process.env.AGENTROUTER_API_KEY;
    process.env.AGENTROUTER_USER_AGENT = "some-authorised-agent/1.0";
    expect(healthPayload().providers.agentrouter).toBe(false);
  });

  it("a key alone IS ready when pointed at a gateway that does not gate on the client", () => {
    // OpenRouter, LiteLLM and friends authenticate on the key. Demanding an agent string there
    // would hide models that work perfectly well.
    process.env.AGENTROUTER_API_KEY = KEY;
    delete process.env.AGENTROUTER_USER_AGENT;
    for (const base of ["https://openrouter.ai/api/v1", "http://localhost:4000/v1", "https://gateway.internal/v1/"]) {
      process.env.AGENTROUTER_BASE_URL = base;
      expect(healthPayload().providers.agentrouter, base).toBe(true);
    }
  });

  it("still demands an agent for agentrouter.org spelt any of the ways it can be spelt", () => {
    process.env.AGENTROUTER_API_KEY = KEY;
    delete process.env.AGENTROUTER_USER_AGENT;
    for (const base of [
      "https://agentrouter.org/v1",
      "https://api.agentrouter.org/v1",
      "http://agentrouter.org:8080/v1",
      "https://AgentRouter.org/v1/",
    ]) {
      process.env.AGENTROUTER_BASE_URL = base;
      expect(healthPayload().providers.agentrouter, base).toBe(false);
    }
  });

  it("advertises the gateway models under the gateway provider", () => {
    const gw = healthPayload().models.filter((m) => m.provider === "agentrouter");
    expect(gw.map((m) => m.id)).toEqual([
      "agentrouter/claude-opus-5",
      "agentrouter/claude-opus-4-8",
      "agentrouter/gpt-5.6-sol",
    ]);
  });
});
