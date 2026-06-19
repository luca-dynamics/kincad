import { describe, it, expect } from "vitest";
import { synthesizeFunctionGenerator, synthesizeTwoPosition } from "../synthesis";
import { analyzeFourBar, solvePosition } from "../fourbar";
import { toRad } from "../vector";

describe("Freudenstein function generation", () => {
  it("round-trips: a linkage analysed at 3 angles is recovered by synthesis", () => {
    // Take a known linkage, read its (theta2 -> theta4) at three inputs, then synthesise
    // from those points and confirm we get a linkage that reproduces the same outputs.
    const known = {
      ground: 4,
      input: 1.2,
      coupler: 3.5,
      output: 2.8,
      couplerPointDist: 1,
      couplerPointAngle: 0,
      circuit: "open" as const,
    };
    const inputs = [toRad(40), toRad(90), toRad(140)];
    const outs = inputs.map((t2) => {
      const p = solvePosition(known, t2);
      expect(p).not.toBeNull();
      return p!.theta4;
    });

    const res = synthesizeFunctionGenerator({
      theta2: [inputs[0], inputs[1], inputs[2]],
      theta4: [outs[0], outs[1], outs[2]],
      ground: known.ground,
    });

    expect(res.feasible).toBe(true);
    expect(res.link).not.toBeNull();

    // The synthesised linkage must reproduce the target output angles at the precision pts.
    for (let i = 0; i < 3; i++) {
      const st = analyzeFourBar(res.link!, inputs[i]);
      expect(st.valid).toBe(true);
      // angles may differ by a multiple of 2pi; compare via cos/sin
      expect(Math.cos(st.theta4)).toBeCloseTo(Math.cos(outs[i]), 4);
      expect(Math.sin(st.theta4)).toBeCloseTo(Math.sin(outs[i]), 4);
    }
  });

  it("flags degenerate / non-physical precision points", () => {
    const res = synthesizeFunctionGenerator({
      theta2: [toRad(10), toRad(10), toRad(10)], // singular: identical inputs
      theta4: [toRad(20), toRad(40), toRad(60)],
    });
    expect(res.feasible).toBe(false);
    expect(res.link).toBeNull();
  });
});

describe("two-position synthesis", () => {
  it("places fixed pivots at the bisector midpoints", () => {
    const res = synthesizeTwoPosition({
      pointStart: { x: 0, y: 0 },
      pointEnd: { x: 2, y: 0 },
      point2Start: { x: 0, y: 2 },
      point2End: { x: 4, y: 2 },
    });
    expect(res.fixedPivotA).toEqual({ x: 1, y: 0 });
    expect(res.fixedPivotB).toEqual({ x: 2, y: 2 });
  });
});
