// Offline agent — works with no API key. It (1) executes workspace commands parsed from
// natural language, (2) answers common ME questions from a small knowledge base, and
// (3) narrates the deterministic analysis. After any geometry edit it recomputes the report
// so its description reflects the NEW mechanism, not the old one.

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
        text:
          "I can see you attached an image, but offline mode can't analyse images. Select a vision-capable cloud model " +
          "(Claude, GPT-4o, or Gemini) from the model menu and add a key to interpret sketches or diagrams. " +
          "Meanwhile, you can describe the mechanism in text and I'll build it.",
      };
    }

    // Freeform 3D CAD generation needs a connected model (the offline agent only does mechanisms).
    if (/\b(cad part|3d part|3d model|\.stl|\bstl\b|bracket|flange|enclosure|gear blank|extrude|fillet)\b/.test(lower)) {
      return {
        text:
          "Generating freeform 3D CAD parts (brackets, plates, flanges…) needs a connected model — pick Claude, GPT-4o " +
          "or Gemini from the model menu and add a key, then describe the part and I'll build it and let you export STL. " +
          "Offline, I can still build and analyse four-bar and slider-crank mechanisms.",
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
          ? buildFourBarReport(next.fourbar, 360)
          : buildSliderCrankReport(next.slider, 360);
      return {
        text: `Done — ${intent.note}. Here's the updated analysis:\n\n${describeReport(report)}`,
        actions: [...intent.actions, { type: "run_analysis" }],
      };
    }

    // 2) Direct narration requests about the current design.
    if (/improve|suggest|better|optimi|fix|reduce|increase the/.test(lower))
      return { text: suggestImprovements(ctx.report) };
    if (/velocity|speed|omega|acceler|alpha|motion/.test(lower))
      return { text: describeMotion(ctx.report) };
    if (/explain|result|summary|report|analy|current|this mechanism|is this/.test(lower))
      return { text: describeReport(ctx.report) };

    // 3) Knowledge base.
    const kb = lookupKnowledge(q);
    if (kb) return { text: kb };

    // 4) Fallback — be honest about the offline limitation.
    return {
      text:
        "Offline mode handles workspace commands (e.g. *“make a crank-rocker”*, *“set coupler to 3.5”*, " +
        "*“switch to slider-crank”*), explanations of the current analysis, and common kinematics topics " +
        "(Grashof, transmission angle, DOF, coupler curves, synthesis). For open-ended questions, connect a " +
        "Claude model from the selector above. What would you like to do?",
    };
  }
}
