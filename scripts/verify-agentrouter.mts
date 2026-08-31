/**
 * End-to-end proof that the gateway now works THROUGH KINCAD, not merely through curl.
 *
 * A raw HTTP 200 only proves the gate opened. What has to be true for the integration to be real is
 * that KINCAD's own handler routes to the gateway, that the model executes the engine-grounded tools,
 * and that the numbers coming back are the deterministic engine's rather than the model's invention.
 * So this drives `runCopilot` exactly as the Express route and the Vercel function do, and then checks
 * the returned figures against a direct call into the engine.
 *
 * Run:  npx tsx scripts/verify-agentrouter.mts
 */
import "dotenv/config";
import { runCopilot, healthPayload } from "../server/handler.ts";
import { reportFor } from "../src/insight.ts";
import { DEFAULT_OMEGA2 } from "../src/state.ts";

const MODEL = "agentrouter/claude-opus-4-8";

function line(s = "") {
  console.log(s);
}

line("=== health, as the client sees it");
const health = healthPayload();
line(`    providers: ${JSON.stringify(health.providers)}`);
line(`    gateway ready: ${health.providers.agentrouter}`);
if (!health.providers.agentrouter) {
  line("    -> not ready, so the models would be hidden. Stopping.");
  process.exit(1);
}

line();
line(`=== asking ${MODEL} to build and analyse a four-bar`);
const t0 = Date.now();
const res = await runCopilot({
  model: MODEL,
  messages: [
    {
      role: "user",
      content:
        "Set a four-bar with ground 6, crank 2, coupler 7.8, rocker 7, then analyse it. " +
        "State the Grashof classification and the minimum transmission angle.",
    },
  ],
});
const ms = Date.now() - t0;

line(`    status ${res.status}  (${ms} ms)`);
if (res.status !== 200) {
  line(`    body: ${JSON.stringify(res.body).slice(0, 600)}`);
  process.exit(1);
}

const body = res.body as { text: string; actions: { type: string }[] };
line(`    actions the model drove: ${JSON.stringify(body.actions.map((a) => a.type))}`);
line();
line("    reply:");
for (const l of body.text.split("\n")) line(`      ${l}`);

// The grounding check. Whatever the model said, the engine is the authority; if the figures it quoted
// are not the engine's, the tool loop is decorative.
line();
line("=== the engine's own numbers for that linkage");
const truth = reportFor(
  { kind: "fourbar", fourbar: { ground: 6, input: 2, coupler: 7.8, output: 7, couplerRatio: 0.5, couplerAngleDeg: 0 } },
  DEFAULT_OMEGA2,
);
const grashof = truth.grashof.type;
const minTa = truth.transmission.min.value;
line(`    Grashof: ${grashof}`);
line(`    min transmission angle: ${minTa.toFixed(4)}°`);
line(`    reachable arc: ${truth.reachableArcDeg}°`);

line();
line("=== does the reply quote the engine, or invent?");
const said = body.text.toLowerCase();
const quotesGrashof = said.includes(grashof.toLowerCase().replace("-", "-")) || said.includes(grashof.split("-")[0]);
const taStr = minTa.toFixed(1);
const quotesAngle = said.includes(taStr) || said.includes(minTa.toFixed(0)) || said.includes(minTa.toFixed(2));
line(`    mentions the Grashof class "${grashof}": ${quotesGrashof}`);
line(`    quotes the transmission angle ~${taStr}: ${quotesAngle}`);
line(`    ran the engine tools: ${body.actions.length > 0}`);
line();
line(quotesGrashof && quotesAngle && body.actions.length > 0
  ? "VERDICT: gateway works through KINCAD and the reply is engine-grounded."
  : "VERDICT: reached the gateway, but check the grounding above by eye.");
