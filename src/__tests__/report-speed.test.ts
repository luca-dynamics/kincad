// The report's velocity/acceleration figures must be the ones the interface is showing.
//
// WHY THIS FILE EXISTS: `buildFourBarReport`/`buildSliderCrankReport` default to the engine's
// unit rate (ω₂ = 1 rad/s), which is a legitimate convention for the solver but the wrong basis
// for the app — the workspace runs at DEFAULT_OMEGA2 = 2π. For a while the app never passed its
// own speed, so the PDF and the parameter dock printed ω₄ understated by 6.28× and α₄ by 39.5×
// while the live readout and the plots beside them showed the true figures. It was caught by a
// human reading a printed report next to the screen. These tests assert the scaling law the
// mismatch violated, so the same class of defect fails here instead.

import { describe, expect, it } from "vitest";
import type { FourBarReport, SliderCrankReport } from "../engine";
import { reportFor } from "../insight";
import { DEFAULT_FOURBAR, DEFAULT_OMEGA2, DEFAULT_SLIDER } from "../state";

const FOURBAR = { kind: "fourbar" as const, fourbar: DEFAULT_FOURBAR, slider: DEFAULT_SLIDER };
const SLIDER = { kind: "slidercrank" as const, fourbar: DEFAULT_FOURBAR, slider: DEFAULT_SLIDER };

const fourbar = (omega2: number) => reportFor(FOURBAR, omega2) as FourBarReport;
const slider = (omega2: number) => reportFor(SLIDER, omega2) as SliderCrankReport;

/** The speed multiple under test: the workspace default against the engine's unit rate. */
const K = DEFAULT_OMEGA2;

describe("the report records the speed it swept at", () => {
  it("carries ω₂ on a four-bar report", () => {
    expect(fourbar(DEFAULT_OMEGA2).omega2).toBe(DEFAULT_OMEGA2);
    expect(fourbar(1).omega2).toBe(1);
  });

  it("carries ω₂ on a slider-crank report", () => {
    expect(slider(DEFAULT_OMEGA2).omega2).toBe(DEFAULT_OMEGA2);
    expect(slider(1).omega2).toBe(1);
  });

  it("is the only place the speed can be recovered from, which is why it is recorded", () => {
    // ω₂ is not derivable from the published figures — the report holds extrema, not the input
    // series — so a report without this field cannot be labelled, and an unlabelled velocity is
    // the defect above. Nothing else on the report changes when only the speed does.
    const unit = fourbar(1);
    const fast = fourbar(DEFAULT_OMEGA2);
    expect(Object.keys(unit)).toContain("omega2");
    expect(fast.link).toEqual(unit.link);
  });
});

describe("four-bar: velocity scales with ω₂, acceleration with ω₂²", () => {
  const unit = fourbar(1);
  const fast = fourbar(K);

  it("scales ω₄ linearly", () => {
    expect(fast.omega4.min.value).toBeCloseTo(unit.omega4.min.value * K, 9);
    expect(fast.omega4.max.value).toBeCloseTo(unit.omega4.max.value * K, 9);
  });

  it("scales α₄ with the square, the input being steady (α₂ = 0)", () => {
    expect(fast.alpha4.min.value).toBeCloseTo(unit.alpha4.min.value * K * K, 9);
    expect(fast.alpha4.max.value).toBeCloseTo(unit.alpha4.max.value * K * K, 9);
  });

  it("puts every extremum at the same crank angle, since only the scale changed", () => {
    expect(fast.omega4.min.atTheta2Deg).toBe(unit.omega4.min.atTheta2Deg);
    expect(fast.omega4.max.atTheta2Deg).toBe(unit.omega4.max.atTheta2Deg);
    expect(fast.alpha4.min.atTheta2Deg).toBe(unit.alpha4.min.atTheta2Deg);
    expect(fast.alpha4.max.atTheta2Deg).toBe(unit.alpha4.max.atTheta2Deg);
  });

  it("leaves the geometry-only figures untouched", () => {
    // These are why the wrong report looked right: everything a reader checks first is
    // speed-invariant, so only the velocities and accelerations disagreed with the screen.
    expect(fast.grashof).toEqual(unit.grashof);
    expect(fast.transmission).toEqual(unit.transmission);
    expect(fast.couplerExtent).toEqual(unit.couplerExtent);
    expect(fast.reachableArcDeg).toBe(unit.reachableArcDeg);
    expect(fast.inputFullyRotates).toBe(unit.inputFullyRotates);
    expect(fast.warnings).toEqual(unit.warnings);
  });

  it("actually differs at the two speeds, so the assertions above are not vacuous", () => {
    expect(Math.abs(unit.omega4.max.value)).toBeGreaterThan(1e-6);
    expect(fast.omega4.max.value).not.toBe(unit.omega4.max.value);
  });
});

describe("slider-crank: velocity scales with ω₂, acceleration with ω₂²", () => {
  const unit = slider(1);
  const fast = slider(K);

  it("scales slider velocity linearly", () => {
    expect(fast.sliderVel.min.value).toBeCloseTo(unit.sliderVel.min.value * K, 9);
    expect(fast.sliderVel.max.value).toBeCloseTo(unit.sliderVel.max.value * K, 9);
  });

  it("scales slider acceleration with the square", () => {
    expect(fast.sliderAcc.min.value).toBeCloseTo(unit.sliderAcc.min.value * K * K, 9);
    expect(fast.sliderAcc.max.value).toBeCloseTo(unit.sliderAcc.max.value * K * K, 9);
  });

  it("leaves stroke and transmission angle untouched — both are pure geometry", () => {
    expect(fast.stroke).toBe(unit.stroke);
    expect(fast.transmission).toEqual(unit.transmission);
  });

  it("actually differs at the two speeds", () => {
    expect(Math.abs(unit.sliderVel.max.value)).toBeGreaterThan(1e-6);
    expect(fast.sliderAcc.max.value).not.toBe(unit.sliderAcc.max.value);
  });
});
