// KINCAD AgentRouter relay — Cloudflare Worker edition (free, always-on, no home machine).
//
// Deploy this as a Worker (workers.dev is free) and point KINCAD at it by setting, in Vercel,
//   AGENTROUTER_BASE_URL = https://<worker-name>.<your-subdomain>.workers.dev/v1
// (keep AGENTROUTER_API_KEY and AGENTROUTER_USER_AGENT set as before). runAgentRouter already
// honours AGENTROUTER_BASE_URL, so no app-code change is needed.
//
// CONFIRMED (2026-08-31): Cloudflare's egress IS accepted by agentrouter.org. Measured end to end,
// GET /healthz returned 200 and POST /v1/chat/completions with a valid key returned 200 JSON, where
// the identical call straight from Vercel gets the gateway's SPA HTML ("<!doctype") and fails. So it
// is Vercel/AWS egress specifically that agentrouter.org rejects, not datacenters in general, and
// this Worker is a free, always-on bridge that needs no home machine. If the gateway ever tightens
// its IP checks this could change: re-test (hit /healthz, then POST a real completion and confirm you
// get JSON, not "<!doctype"), and fall back to scripts/agentrouter-relay.mjs on a home machine, or
// just use Gemini.
//
// It holds no key (the app forwards Authorization; agentrouter's key gate still applies).
//
// Optional Worker variables (Settings → Variables):
//   RELAY_USER_AGENT   force this User-Agent on every forwarded call (recommended: the agent
//                      agentrouter authorises for your key, e.g. opencode/1.0.0). Not hardcoded here
//                      so the Worker ships no impersonation nobody chose.
//   RELAY_PATH_PREFIX  optional shared secret: requests must sit under /<prefix>/ (stripped before
//                      forwarding) so the Worker URL isn't an open proxy. Then set
//                      AGENTROUTER_BASE_URL = https://<host>/<prefix>/v1.

const UPSTREAM = "https://agentrouter.org";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
      return new Response("kincad agentrouter worker relay: ok\n", { headers: { "content-type": "text/plain" } });
    }

    let path = url.pathname;
    const prefix = env.RELAY_PATH_PREFIX ? "/" + env.RELAY_PATH_PREFIX.replace(/^\/+|\/+$/g, "") : "";
    if (prefix) {
      if (url.pathname !== prefix && !url.pathname.startsWith(prefix + "/")) {
        return new Response("not found\n", { status: 404 });
      }
      path = url.pathname.slice(prefix.length) || "/";
    }

    // Copy the incoming headers, then drop the ones that must not ride along: the Worker's own host,
    // stale length/encoding (fetch recomputes), and every Cloudflare/forwarded header that would
    // announce this as datacenter traffic.
    const headers = new Headers(request.headers);
    for (const k of [...headers.keys()]) {
      const lk = k.toLowerCase();
      if (
        lk === "host" ||
        lk === "content-length" ||
        lk === "accept-encoding" ||
        lk === "x-real-ip" ||
        lk.startsWith("cf-") ||
        lk.startsWith("x-forwarded")
      ) {
        headers.delete(k);
      }
    }
    if (env.RELAY_USER_AGENT) headers.set("user-agent", env.RELAY_USER_AGENT);

    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

    let upstream;
    try {
      upstream = await fetch(UPSTREAM + path + url.search, { method: request.method, headers, body });
    } catch (e) {
      return new Response(JSON.stringify({ error: `relay failed: ${e && e.message ? e.message : String(e)}` }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    // Read as text and re-serve uncompressed: agentrouter returns JSON as text/plain, and the app
    // parses by content, not content-type. This sidesteps any content-encoding mismatch.
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
    });
  },
};
