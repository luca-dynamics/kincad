// Deterministic narration of the analysis report. These helpers turn engine output into
// prose. They are the ONLY way the offline agent talks about numbers — every figure here is
// read straight from the report the engine produced.
//
// THE OUTPUT IS MARKDOWN, AND THE RENDERER TREATS IT AS SUCH. components/chat/Markdown.tsx runs
// this text through remark-gfm, so the separators matter as much as the words: a *single* newline
// is a soft break and collapses to a space. These helpers used to build `•` bullets joined with
// "\n", which meant the renderer received one run-on paragraph — "**Four-bar linkage:
// crank-rocker.** • Input: full 360° crank. • Transmission angle: 43.2°–136.8° …" — no matter how
// well the bubble was styled. Real lists need `- ` and a blank line before them, so every block
// below is joined with "\n\n" and every bullet starts with "- ".
//
// Labels are bold and end with a colon, figures are plain: the same label/value split the
// parameters dock uses. A colon rather than a dash, because these bullets are read as much as they
// are skimmed, and "Input — full 360° crank" turns into a tic once four of them stack up. Figures
// are deliberately NOT wrapped in backticks, which would give every number the inline-code pill.

import type { AnalysisReport } from "../engine";
import { perSec, perSec2, type LengthUnit } from "../units";

/**
 * The engine's own warning list, as a markdown list under a lead-in — or the plain sentence that
 * says there are none. The wording inside each warning is untouched: this is the same sentence the
 * dock shows beside a TriangleAlert and the PDF prints, and it must read identically in all three.
 */
function warningBlock(warnings: string[]): string {
  if (!warnings.length) return "No design-rule warnings.";
  return ["**Design-rule warnings**", warnings.map((w) => `- ⚠ ${w}`).join("\n")].join("\n\n");
}

/**
 * The whole-cycle summary, in prose.
 *
 * `unit` is the workspace's declared length unit ([units.ts](../units.ts)). Narration is where the
 * placeholder was most visible — the envelope read "≈ 3.21 × 1.84 units" — and it is also the text
 * the model is shown, so what the agent says a stroke is has to be what the dock and the PDF say.
 */
export function describeReport(r: AnalysisReport, unit: LengthUnit): string {
  if (r.kind === "fourbar") {
    return [
      `**Four-bar linkage: ${r.grashof.type}.**`,
      r.grashof.summary,
      [
        `- **Input:** ${r.inputFullyRotates ? "full 360° crank" : `oscillates over ≈ ${r.reachableArcDeg.toFixed(0)}°`}`,
        `- **Transmission angle:** ${r.transmission.min.value.toFixed(1)}°–${r.transmission.max.value.toFixed(1)}° (mean ${r.transmission.mean.toFixed(1)}°)`,
        `- **Output ω₄:** ${r.omega4.min.value.toFixed(2)} → ${r.omega4.max.value.toFixed(2)} rad/s per rad/s of input`,
        `- **Coupler-curve envelope:** ≈ ${r.couplerExtent.width.toFixed(2)} × ${r.couplerExtent.height.toFixed(2)} ${unit}`,
      ].join("\n"),
      warningBlock(r.warnings),
    ].join("\n\n");
  }
  return [
    `**Slider-crank mechanism.**`,
    [
      `- **Crank:** ${r.inputFullyRotates ? "fully rotates" : "cannot fully rotate with this rod/offset"}`,
      `- **Slider stroke:** ${r.stroke.toFixed(2)} ${unit}`,
      `- **Slider velocity:** ${r.sliderVel.min.value.toFixed(2)} → ${r.sliderVel.max.value.toFixed(2)} ${perSec(unit)} per rad/s`,
      `- **Peak acceleration:** ${Math.max(Math.abs(r.sliderAcc.min.value), Math.abs(r.sliderAcc.max.value)).toFixed(2)} ${perSec2(unit)}`,
    ].join("\n"),
    warningBlock(r.warnings),
  ].join("\n\n");
}

/** The velocity/acceleration story, in prose. `unit` as in `describeReport`. */
export function describeMotion(r: AnalysisReport, unit: LengthUnit): string {
  if (r.kind === "fourbar") {
    return [
      `Output angular velocity ω₄ swings between ${r.omega4.min.value.toFixed(2)} and ${r.omega4.max.value.toFixed(2)} rad/s ` +
        `(per 1 rad/s input), and α₄ between ${r.alpha4.min.value.toFixed(2)} and ${r.alpha4.max.value.toFixed(2)} rad/s².`,
      `The extremes sit near the toggle positions, where the transmission angle is smallest.`,
    ].join("\n\n");
  }
  return [
    `The slider peaks at ${Math.max(Math.abs(r.sliderVel.min.value), Math.abs(r.sliderVel.max.value)).toFixed(2)} ${perSec(unit)} ` +
      `around mid-stroke.`,
    `Its acceleration peaks at the dead centres, where rod inertia loads are highest.`,
  ].join("\n\n");
}

export function suggestImprovements(r: AnalysisReport): string {
  const tips: string[] = [];
  if (r.kind === "fourbar") {
    if (r.transmission.min.value < 40)
      tips.push(
        `Raise the worst transmission angle (now ${r.transmission.min.value.toFixed(1)}° @ θ₂≈${r.transmission.min.atTheta2Deg.toFixed(0)}°): lengthen the output/coupler relative to the crank, or shorten the crank.`,
      );
    if (!r.inputFullyRotates)
      tips.push("Make the driven link the shortest to obtain a fully-rotating crank (crank-rocker).");
    if (r.grashof.type === "change-point")
      tips.push("This is a change-point (e.g. parallelogram); add a slight length offset to avoid the collinear singularity.");
  } else {
    if (!r.inputFullyRotates) tips.push("Lengthen the rod (rule of thumb: rod ≥ offset + crank) so the crank fully rotates.");
    if (r.transmission.min.value < 40) tips.push("Reduce the offset or lengthen the rod to cut side thrust on the slider.");
  }
  if (!tips.length)
    tips.push("Proportions look healthy, with no rule-of-thumb violations. You could tune the coupler point to reshape the coupler curve.");
  return [
    "**Suggestions** (you confirm; the solver re-checks every change)",
    tips.map((t) => `- ${t}`).join("\n"),
  ].join("\n\n");
}
