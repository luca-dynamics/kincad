// Offline agent — works with no API key. It (1) executes workspace commands parsed from
// natural language, (2) answers common ME questions from a small knowledge base, and
// (3) narrates the deterministic analysis. After any geometry edit it recomputes the report
// so its description reflects the NEW mechanism, not the old one.
//
// The canned replies below are MARKDOWN, on the same terms as narrate.ts: blocks joined with
// "\n\n", bullets starting "- ", bold label then plain detail. Each of them enumerates options —
// what to do instead, what still works offline — and a list is what that is. Written as one
// paragraph they read as a wall of prose, which is exactly the run-on the narration was fixed for.

import { buildFourBarReport, buildSliderCrankReport } from "../engine";
import { applyActions } from "./apply";
import { lookupKnowledge } from "./knowledge";
import { parseIntent } from "./intent";
import { describeMotion, describeReport, suggestImprovements } from "./narrate";
import type { AgentContext, AgentModel, AgentReply, ChatMessage } from "./types";

export class OfflineAgent implements AgentModel {
  readonly id = "offline";
  readonly label = "Offline (no key)";
  readonly available = true;

  async respond(messages: ChatMessage[], ctx: AgentContext): Promise<AgentReply> {
    const lastUser = messages.filter((m) => m.role === "user").pop();
    const q = lastUser?.content ?? "";
    const lower = q.toLowerCase();

    if (lastUser?.attachments?.length) {
      return {
        text: [
          "I can see the attachment, but offline mode can't analyse images.",
          [
            "- **To read a sketch or diagram** — pick a vision-capable cloud model (Claude, GPT-4o or Gemini) from the model menu and add a key.",
            "- **Or describe it in words** — give me the link lengths and I'll build the mechanism now.",
          ].join("\n"),
        ].join("\n\n"),
      };
    }

    // Freeform 3D CAD generation needs a connected model (the offline agent only does mechanisms).
    if (/\b(cad part|3d part|3d model|\.stl|\bstl\b|bracket|flange|enclosure|gear blank|extrude|fillet)\b/.test(lower)) {
      return {
        text: [
          "Freeform 3D CAD parts — brackets, plates, flanges — need a connected model.",
          [
            "- **To generate one** — pick Claude, GPT-4o or Gemini from the model menu and add a key, then describe the part. You'll be able to export STL.",
            "- **Offline** — I can still build and analyse four-bar and slider-crank mechanisms.",
          ].join("\n"),
        ].join("\n\n"),
      };
    }

    // 1) Workspace commands → actions + solver-grounded confirmation.
    const intent = parseIntent(q, ctx.kind);
    if (intent.actions.length) {
      const next = applyActions(
        { kind: ctx.kind, fourbar: ctx.fourbar, slider: ctx.slider },
        intent.actions,
      );
      const report =
        next.kind === "fourbar"
          ? buildFourBarReport(next.fourbar, 360, ctx.omega2)
          : buildSliderCrankReport(next.slider, 360, ctx.omega2);
      return {
        text: `Done — ${intent.note}. Here's the updated analysis:\n\n${describeReport(report, ctx.unit)}`,
        actions: [...intent.actions, { type: "run_analysis" }],
      };
    }

    // 2) Direct narration requests about the current design.
    if (/improve|suggest|better|optimi|fix|reduce|increase the/.test(lower))
      return { text: suggestImprovements(ctx.report) };
    if (/velocity|speed|omega|acceler|alpha|motion/.test(lower))
      return { text: describeMotion(ctx.report, ctx.unit) };
    if (/explain|result|summary|report|analy|current|this mechanism|is this/.test(lower))
      return { text: describeReport(ctx.report, ctx.unit) };

    // 3) Knowledge base.
    const kb = lookupKnowledge(q);
    if (kb) return { text: kb };

    // 4) Fallback — be honest about the offline limitation.
    return {
      text: [
        "Offline mode handles three things:",
        [
          "- **Workspace commands** — *“make a crank-rocker”*, *“set coupler to 3.5”*, *“switch to slider-crank”*.",
          "- **Explanations of the current analysis** — the results, the motion, or how to improve the design.",
          "- **Common kinematics topics** — Grashof, transmission angle, DOF, coupler curves, synthesis.",
        ].join("\n"),
        "For open-ended questions, connect a Claude model from the selector above. What would you like to do?",
      ].join("\n\n"),
    };
  }
}
