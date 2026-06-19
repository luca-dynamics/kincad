import { describe, it, expect } from "vitest";
import {
  analyzeSliderCrank,
  solveSliderPosition,
  sliderInputFullyRotates,
} from "../slidercrank";
import type { SliderCrankLinkage } from "../types";
import { toRad } from "../vector";

const inline: SliderCrankLinkage = { crank: 1, rod: 3, offset: 0 };
const offset: SliderCrankLinkage = { crank: 1, rod: 3, offset: 0.5 };

describe("slider-crank position", () => {
  it("in-line: slider reaches a+b at TDC and b-a at BDC", () => {
    const tdc = analyzeSliderCrank(inline, toRad(0));
    const bdc = analyzeSliderCrank(inline, toRad(180));
    expect(tdc.sliderPos).toBeCloseTo(inline.crank + inline.rod, 6); // 4
    expect(bdc.sliderPos).toBeCloseTo(inline.rod - inline.crank, 6); // 2
  });

  it("rod length is preserved between crank tip and slider pin", () => {
    for (let deg = 0; deg < 360; deg += 13) {
      const st = analyzeSliderCrank(offset, toRad(deg));
      if (!st.valid) continue;
      expect(Math.hypot(st.B.x - st.A.x, st.B.y - st.A.y)).toBeCloseTo(
        offset.rod,
        6,
      );
      expect(st.B.y).toBeCloseTo(offset.offset, 9); // slider stays on its rail
    }
  });

  it("flags non-assemblable geometry (rod too short to reach the rail)", () => {
    const bad: SliderCrankLinkage = { crank: 5, rod: 1, offset: 0 };
    let unreachable = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      if (solveSliderPosition(bad, toRad(deg)) === null) unreachable++;
    }
    expect(unreachable).toBeGreaterThan(0);
    expect(sliderInputFullyRotates(bad)).toBe(false);
    expect(sliderInputFullyRotates(inline)).toBe(true);
  });
});

describe("slider-crank velocity & acceleration (finite-difference cross-check)", () => {
  it("slider velocity matches dx/dt", () => {
    const omega2 = 3.0;
    const h = 1e-6;
    for (const link of [inline, offset]) {
      for (let deg = 7; deg < 360; deg += 19) {
        const t2 = toRad(deg);
        const st = analyzeSliderCrank(link, t2, omega2);
        const fwd = solveSliderPosition(link, t2 + h);
        const bwd = solveSliderPosition(link, t2 - h);
        if (!st.valid || !fwd || !bwd) continue;
        const dx = ((fwd.x - bwd.x) / (2 * h)) * omega2;
        expect(st.sliderVel).toBeCloseTo(dx, 3);
      }
    }
  });

  it("slider acceleration matches dv/dt", () => {
    const omega2 = 2.0;
    const h = 1e-5;
    for (const link of [inline, offset]) {
      for (let deg = 7; deg < 360; deg += 23) {
        const t2 = toRad(deg);
        const st = analyzeSliderCrank(link, t2, omega2);
        const fwd = analyzeSliderCrank(link, t2 + h, omega2);
        const bwd = analyzeSliderCrank(link, t2 - h, omega2);
        if (!st.valid || !fwd.valid || !bwd.valid) continue;
        const dv = ((fwd.sliderVel - bwd.sliderVel) / (2 * h)) * omega2;
        expect(st.sliderAcc).toBeCloseTo(dv, 2);
      }
    }
  });

  it("omega3 matches d(theta3)/dt", () => {
    const omega2 = 2.2;
    const h = 1e-6;
    for (let deg = 7; deg < 360; deg += 17) {
      const t2 = toRad(deg);
      const st = analyzeSliderCrank(offset, t2, omega2);
      const fwd = solveSliderPosition(offset, t2 + h);
      const bwd = solveSliderPosition(offset, t2 - h);
      if (!st.valid || !fwd || !bwd) continue;
      const dT3 = ((fwd.theta3 - bwd.theta3) / (2 * h)) * omega2;
      expect(st.omega3).toBeCloseTo(dT3, 3);
    }
  });
});
