// Deterministic analysis SUMMARY. Aggregates a full-cycle sweep into the headline numbers an
// engineer (or the AI copilot, or the PDF report) needs. Every value here is computed by the
// solvers — nothing is estimated.
//
// The two builders take the input speed ω₂ and echo it back on the report they return. The default
// of 1 rad/s is a UNIT-RATE analysis — a legitimate engine convention (ω₄/ω₂ is the velocity ratio,
// and μ, Grashof, stroke and the coupler envelope are geometry-only) but the wrong basis for
// anything the user reads next to their own speed setting. Application code must therefore reach
// these through `insight.ts → reportFor`, where ω₂ is a REQUIRED argument.

import { classifyGrashof, inputFullyRotates, sweepFourBar } from "./fourbar";
import { sliderInputFullyRotates, sweepSliderCrank } from "./slidercrank";
import type { FourBarLinkage, GrashofResult, SliderCrankLinkage } from "./types";
import { toDeg } from "./vector";

export interface Extremum {
  value: number;
  atTheta2Deg: number;
}

export interface FourBarReport {
  kind: "fourbar";
  link: FourBarLinkage;
  /**
   * The input speed the velocity and acceleration figures below were computed at, in rad/s.
   *
   * Recorded rather than assumed, because it is not recoverable from the numbers: ω₄ scales
   * linearly with ω₂ and α₄ with ω₂², so a sweep at the engine's unit-rate default produces a
   * self-consistent report whose speeds are silently wrong for the workspace that requested it.
   * That is exactly the defect this field exists to make impossible — any consumer printing
   * `omega4`/`alpha4` must print this alongside them.
   */
  omega2: number;
  grashof: GrashofResult;
  inputFullyRotates: boolean;
  reachableArcDeg: number; // how much of 360° the input can occupy
  transmission: { min: Extremum; max: Extremum; mean: number; poorBelowDeg: number };
  omega4: { min: Extremum; max: Extremum };
  alpha4: { min: Extremum; max: Extremum };
  couplerExtent: { width: number; height: number };
  warnings: string[];
}

export interface SliderCrankReport {
  kind: "slidercrank";
  link: SliderCrankLinkage;
  /** Input speed the velocity/acceleration figures were computed at, in rad/s. See `FourBarReport`. */
  omega2: number;
  inputFullyRotates: boolean;
  stroke: number;
  sliderVel: { min: Extremum; max: Extremum };
  sliderAcc: { min: Extremum; max: Extremum };
  transmission: { min: Extremum; max: Extremum };
  warnings: string[];
}

export type AnalysisReport = FourBarReport | SliderCrankReport;

/**
 * The design guideline every transmission-angle judgement in the app is measured against.
 * Exported because the UI colour-codes against it too: `FourBarReport` publishes it as
 * `transmission.poorBelowDeg`, but the slider-crank report has no such field while applying the
 * identical rule below — so a consumer that handles both mechanisms needs the number itself.
 */
export const POOR_TRANSMISSION_DEG = 40; // common design rule of thumb

export function buildFourBarReport(link: FourBarLinkage, steps = 720, omega2 = 1): FourBarReport {
  const grashof = classifyGrashof(link);
  const states = sweepFourBar(link, steps, omega2);

  const tA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const tB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  const wA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const wB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  const aA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const aB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  let tSum = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const s of states) {
    const deg = toDeg(s.theta2);
    if (s.transmissionAngle < tA.value) (tA.value = s.transmissionAngle), (tA.atTheta2Deg = deg);
    if (s.transmissionAngle > tB.value) (tB.value = s.transmissionAngle), (tB.atTheta2Deg = deg);
    tSum += s.transmissionAngle;
    if (s.omega4 < wA.value) (wA.value = s.omega4), (wA.atTheta2Deg = deg);
    if (s.omega4 > wB.value) (wB.value = s.omega4), (wB.atTheta2Deg = deg);
    if (s.alpha4 < aA.value) (aA.value = s.alpha4), (aA.atTheta2Deg = deg);
    if (s.alpha4 > aB.value) (aB.value = s.alpha4), (aB.atTheta2Deg = deg);
    minX = Math.min(minX, s.P.x); maxX = Math.max(maxX, s.P.x);
    minY = Math.min(minY, s.P.y); maxY = Math.max(maxY, s.P.y);
  }

  const warnings: string[] = [];
  if (tA.value < POOR_TRANSMISSION_DEG)
    warnings.push(
      `Transmission angle drops to ${tA.value.toFixed(1)}° near θ2 = ${tA.atTheta2Deg.toFixed(0)}° — below the ${POOR_TRANSMISSION_DEG}° guideline; the linkage transmits force poorly there and may bind.`,
    );
  if (!inputFullyRotates(link))
    warnings.push(
      "The input link cannot make a full revolution (it is not the crank). Drive the rotating link, or change proportions to obtain a crank-rocker.",
    );

  return {
    kind: "fourbar",
    link,
    omega2,
    grashof,
    inputFullyRotates: inputFullyRotates(link),
    reachableArcDeg: (states.length / steps) * 360,
    transmission: { min: tA, max: tB, mean: tSum / Math.max(1, states.length), poorBelowDeg: POOR_TRANSMISSION_DEG },
    omega4: { min: wA, max: wB },
    alpha4: { min: aA, max: aB },
    couplerExtent: { width: maxX - minX, height: maxY - minY },
    warnings,
  };
}

export function buildSliderCrankReport(link: SliderCrankLinkage, steps = 720, omega2 = 1): SliderCrankReport {
  const states = sweepSliderCrank(link, steps, omega2);
  const vA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const vB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  const aA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const aB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  const tA: Extremum = { value: Infinity, atTheta2Deg: 0 };
  const tB: Extremum = { value: -Infinity, atTheta2Deg: 0 };
  let minPos = Infinity, maxPos = -Infinity;

  for (const s of states) {
    const deg = toDeg(s.theta2);
    if (s.sliderVel < vA.value) (vA.value = s.sliderVel), (vA.atTheta2Deg = deg);
    if (s.sliderVel > vB.value) (vB.value = s.sliderVel), (vB.atTheta2Deg = deg);
    if (s.sliderAcc < aA.value) (aA.value = s.sliderAcc), (aA.atTheta2Deg = deg);
    if (s.sliderAcc > aB.value) (aB.value = s.sliderAcc), (aB.atTheta2Deg = deg);
    if (s.transmissionAngle < tA.value) (tA.value = s.transmissionAngle), (tA.atTheta2Deg = deg);
    if (s.transmissionAngle > tB.value) (tB.value = s.transmissionAngle), (tB.atTheta2Deg = deg);
    minPos = Math.min(minPos, s.sliderPos); maxPos = Math.max(maxPos, s.sliderPos);
  }

  const warnings: string[] = [];
  if (!sliderInputFullyRotates(link))
    warnings.push(
      "The crank cannot fully rotate: the connecting rod is too short to reach the slider line at all crank angles. Lengthen the rod or reduce the offset.",
    );
  if (tA.value < POOR_TRANSMISSION_DEG)
    warnings.push(
      `Transmission angle falls to ${tA.value.toFixed(1)}° near θ2 = ${tA.atTheta2Deg.toFixed(0)}° — high side thrust on the slider there.`,
    );

  return {
    kind: "slidercrank",
    link,
    omega2,
    inputFullyRotates: sliderInputFullyRotates(link),
    stroke: maxPos - minPos,
    sliderVel: { min: vA, max: vB },
    sliderAcc: { min: aA, max: aB },
    transmission: { min: tA, max: tB },
    warnings,
  };
}
