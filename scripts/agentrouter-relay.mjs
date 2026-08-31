// KINCAD AgentRouter relay — forwards the app's AgentRouter traffic from a residential IP.
//
// WHY THIS EXISTS
// agentrouter.org gates on the caller's egress: a request from Vercel's datacenter IP is answered
// with the gateway's SPA HTML instead of the API, so `/api/copilot` 502s in production even with a
// valid key and the right User-Agent. The identical request from a residential IP returns 200
// (measured). This relay runs on a residential machine and forwards KINCAD's requests through, so
// the call that fails from Vercel succeeds here.
//
// WHAT IT CHANGES
// Only the egress IP. Method, path, headers (including the exact User-Agent the app chose), query
// and body are forwarded verbatim; the upstream status, content-type and body come back verbatim.
// It holds NO key: the app forwards `Authorization`, and agentrouter.org's own key gate still
// applies, so a request without a valid key gets the same 401 it would get anywhere. It also does
// NOT default the User-Agent to any real client — shipping a hardcoded agent would be an
// impersonation nobody chose (the app deliberately doesn't default it either); set RELAY_USER_AGENT
// only if you want the relay to force one.
//
// RUN IT
//   node scripts/agentrouter-relay.mjs
// then expose 127.0.0.1:<port> with any tunnel, e.g.
//   cloudflared tunnel --url http://127.0.0.1:8790
// and in the Vercel project (lucas account) set, then redeploy:
//   AGENTROUTER_BASE_URL = https://<public-host><prefix>/v1
// Keep AGENTROUTER_API_KEY and AGENTROUTER_USER_AGENT set in Vercel as before. To stop using the
// relay, remove AGENTROUTER_BASE_URL and redeploy — the app falls back to hitting agentrouter.org
// directly. The relay only works while this machine and the tunnel stay up.
//
// ENV
//   RELAY_PORT          listen port (default 8790)
//   RELAY_PATH_PREFIX   optional shared secret: requests must sit under /<prefix>/, which is
//                       stripped before forwarding. Set AGENTROUTER_BASE_URL to include it, e.g.
//                       RELAY_PATH_PREFIX=7f3c... -> AGENTROUTER_BASE_URL=https://<host>/7f3c.../v1.
//                       Without it the tunnel forwards every path to agentrouter.org (still key-gated).
//   RELAY_USER_AGENT    optional: force this User-Agent instead of forwarding the app's.

import http from "node:http";

const UPSTREAM = "https://agentrouter.org";
const PORT = Number(process.env.RELAY_PORT) || 8790;
const PREFIX = process.env.RELAY_PATH_PREFIX ? `/${process.env.RELAY_PATH_PREFIX.replace(/^\/+|\/+$/g, "")}` : "";
const UA_OVERRIDE = process.env.RELAY_USER_AGENT;

// Hop-by-hop, host and length headers must not ride along: fetch sets its own, and forwarding the
// tunnel's Host or a stale Content-Length breaks the upstream request. accept-encoding is dropped
// so undici manages compression and hands back already-decoded bytes we can forward as-is.
const STRIP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "keep-alive",
  "proxy-connection",
  "upgrade",
]);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/healthz")) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("kincad agentrouter relay: ok\n");
    return;
  }

  let path = req.url || "/";
  if (PREFIX) {
    if (path !== PREFIX && !path.startsWith(PREFIX + "/")) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found\n");
      return;
    }
    path = path.slice(PREFIX.length) || "/";
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (STRIP.has(k.toLowerCase())) continue;
      headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
    }
    if (UA_OVERRIDE) headers["user-agent"] = UA_OVERRIDE;

    const target = UPSTREAM + path;
    const started = Date.now();
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      const ct = upstream.headers.get("content-type") || "application/octet-stream";
      const ms = Date.now() - started;
      // A datacenter block shows up as an HTML content-type where JSON is expected — surfaced here so
      // it's obvious in the relay console rather than as an opaque 502 in the app.
      const flag = /text\/html/i.test(ct) ? "  <-- HTML (blocked?)" : "";
      console.log(`${req.method} ${path} -> ${upstream.status} ${ct.split(";")[0]} ${ms}ms${flag}`);
      res.writeHead(upstream.status, { "content-type": ct });
      res.end(buf);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.error(`relay error ${req.method} ${path}: ${msg}`);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `relay failed: ${msg}` }));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`kincad agentrouter relay listening on http://127.0.0.1:${PORT}${PREFIX}`);
  console.log(`forwarding -> ${UPSTREAM}`);
  if (!PREFIX) console.log("no RELAY_PATH_PREFIX set: every path is forwarded to agentrouter.org (still key-gated).");
  console.log(`expose it, then set  AGENTROUTER_BASE_URL = https://<public-host>${PREFIX}/v1  in Vercel.`);
});
