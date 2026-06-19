// Deterministic narration of the analysis report. These helpers turn engine output into
// prose. They are the ONLY way the offline agent talks about numbers — every figure here is
// read straight from the report the engine produced.

import type { AnalysisReport } from "../engine";

export function describeReport(r: AnalysisReport): string {
  if (r.kind === "fourbar") {
    return [
      `**Four-bar linkage — ${r.grashof.type}.**`,
      r.grashof.summary,
      "",
      `• Input: ${r.inputFullyRotates ? "full 360° crank" : `oscillates over ≈ ${r.reachableArcDeg.toFixed(0)}°`}.`,
      `• Transmission angle: ${r.transmission.min.value.toFixed(1)}°–${r.transmission.max.value.toFixed(1)}° (mean ${r.transmission.mean.toFixed(1)}°).`,
      `• Output ω₄: ${r.omega4.min.value.toFixed(2)} → ${r.omega4.max.value.toFixed(2)} rad/s per rad/s of input.`,
      `• Coupler-curve envelope ≈ ${r.couplerExtent.width.toFixed(2)} × ${r.couplerExtent.height.toFixed(2)} units.`,
      r.warnings.length ? "\n⚠ " + r.warnings.join("\n⚠ ") : "\nNo design-rule warnings.",
    ].join("\n");
  }
  return [
    `**Slider-crank mechanism.**`,
    `• Crank: ${r.inputFullyRotates ? "fully rotates" : "cannot fully rotate with this rod/offset"}.`,
    `• Slider stroke: ${r.stroke.toFixed(2)} units.`,
    `• Slider velocity: ${r.sliderVel.min.value.toFixed(2)} → ${r.sliderVel.max.value.toFixed(2)} units/s per rad/s.`,
    `• Peak slider acceleration: ${Math.max(Math.abs(r.sliderAcc.min.value), Math.abs(r.sliderAcc.max.value)).toFixed(2)} units/s².`,
    r.warnings.length ? "\n⚠ " + r.warnings.join("\n⚠ ") : "\nNo design-rule warnings.",
  ].join("\n");
}

export function describeMotion(r: AnalysisReport): string {
  if (r.kind === "fourbar") {
    return (
      `Output angular velocity ω₄ swings between ${r.omega4.min.value.toFixed(2)} and ${r.omega4.max.value.toFixed(2)} rad/s ` +
      `(per 1 rad/s input), and α₄ between ${r.alpha4.min.value.toFixed(2)} and ${r.alpha4.max.value.toFixed(2)} rad/s². ` +
      `The extremes sit near the toggle positions, where the transmission angle is smallest.`
    );
  }
  return (
    `The slider peaks at ${Math.max(Math.abs(r.sliderVel.min.value), Math.abs(r.sliderVel.max.value)).toFixed(2)} units/s ` +
    `around mid-stroke; its acceleration peaks at the dead centres, where rod inertia loads are highest.`
  );
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
    tips.push("Proportions look healthy — no rule-of-thumb violations. You could tune the coupler point to reshape the coupler curve.");
  return "Suggestions (you confirm; the solver re-checks every change):\n• " + tips.join("\n• ");
}
