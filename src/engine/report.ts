// Deterministic analysis SUMMARY. Aggregates a full-cycle sweep into the headline numbers an
// engineer (or the AI copilot, or the PDF report) needs. Every value here is computed by the
// solvers — nothing is estimated.

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
  inputFullyRotates: boolean;
  stroke: number;
  sliderVel: { min: Extremum; max: Extremum };
  sliderAcc: { min: Extremum; max: Extremum };
  transmission: { min: Extremum; max: Extremum };
  warnings: string[];
}

export type AnalysisReport = FourBarReport | SliderCrankReport;

const POOR_TRANSMISSION_DEG = 40; // common design rule of thumb

export function buildFourBarReport(link: FourBarLinkage, steps = 720): FourBarReport {
  const grashof = classifyGrashof(link);
  const states = sweepFourBar(link, steps);

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

export function buildSliderCrankReport(link: SliderCrankLinkage, steps = 720): SliderCrankReport {
  const states = sweepSliderCrank(link, steps);
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
    inputFullyRotates: sliderInputFullyRotates(link),
    stroke: maxPos - minPos,
    sliderVel: { min: vA, max: vB },
    sliderAcc: { min: aA, max: aB },
    transmission: { min: tA, max: tB },
    warnings,
  };
}
