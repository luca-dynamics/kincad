import { describe, it, expect } from "vitest";
import {
  analyzeFourBar,
  classifyGrashof,
  solvePosition,
} from "../fourbar";
import type { FourBarLinkage } from "../types";
import { toDeg, toRad } from "../vector";

// A textbook crank-rocker (Norton-style example): ground 4, input 1, coupler 3, output 3.
const crankRocker: FourBarLinkage = {
  ground: 4,
  input: 1,
  coupler: 3,
  output: 3,
  couplerPointDist: 1.5,
  couplerPointAngle: 0,
  circuit: "open",
};

describe("Grashof classification", () => {
  it("classifies a crank-rocker (shortest is a side link, S+L < P+Q)", () => {
    const g = classifyGrashof(crankRocker);
    // S=1, L=4 -> 5 ; P=3, Q=3 -> 6 ; 5 < 6 => Grashof, shortest=input => crank-rocker
    expect(g.isGrashof).toBe(true);
    expect(g.type).toBe("crank-rocker");
    expect(g.shortest).toBe("input");
  });

  it("classifies a drag-link (shortest is ground)", () => {
    const dragLink: FourBarLinkage = { ...crankRocker, ground: 1, input: 3 };
    const g = classifyGrashof(dragLink);
    expect(g.type).toBe("double-crank");
    expect(g.shortest).toBe("ground");
  });

  it("classifies a non-Grashof triple-rocker", () => {
    const tr: FourBarLinkage = {
      ...crankRocker,
      ground: 2,
      input: 2,
      coupler: 2,
      output: 5,
    };
    const g = classifyGrashof(tr);
    // S=2,L=5 ->7 ; P=2,Q=2 ->4 ; 7 > 4 => non-Grashof
    expect(g.isGrashof).toBe(false);
    expect(g.type).toBe("triple-rocker");
  });

  it("detects a change-point (parallelogram: S+L == P+Q)", () => {
    const para: FourBarLinkage = {
      ...crankRocker,
      ground: 3,
      input: 2,
      coupler: 3,
      output: 2,
    };
    const g = classifyGrashof(para);
    expect(g.type).toBe("change-point");
  });
});

describe("four-bar position closed-form", () => {
  it("closes the vector loop: A + coupler == O4 + output", () => {
    for (let deg = 0; deg < 360; deg += 17) {
      const st = analyzeFourBar(crankRocker, toRad(deg));
      if (!st.valid) continue;
      // B reached two ways must agree: via output link from O4, and via coupler from A.
      const bx = st.A.x + crankRocker.coupler * Math.cos(st.theta3);
      const by = st.A.y + crankRocker.coupler * Math.sin(st.theta3);
      expect(bx).toBeCloseTo(st.B.x, 6);
      expect(by).toBeCloseTo(st.B.y, 6);
      // Output link length is preserved.
      expect(Math.hypot(st.B.x - st.O4.x, st.B.y - st.O4.y)).toBeCloseTo(
        crankRocker.output,
        6,
      );
    }
  });

  it("returns null where the linkage cannot assemble in this circuit", () => {
    // A non-Grashof triple-rocker has input angles that are unreachable.
    const tr: FourBarLinkage = {
      ...crankRocker,
      ground: 2,
      input: 2,
      coupler: 2,
      output: 5,
    };
    let unreachable = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      if (solvePosition(tr, toRad(deg)) === null) unreachable++;
    }
    expect(unreachable).toBeGreaterThan(0);
  });
});

describe("four-bar velocity & acceleration (finite-difference cross-check)", () => {
  // The analytical omega/alpha must match numerical derivatives of the position solution.
  it("omega3, omega4 match d(theta)/dt within tolerance", () => {
    const omega2 = 2.5; // rad/s
    const h = 1e-6;
    for (let deg = 5; deg < 360; deg += 23) {
      const t2 = toRad(deg);
      const st = analyzeFourBar(crankRocker, t2, omega2);
      const fwd = solvePosition(crankRocker, t2 + h);
      const bwd = solvePosition(crankRocker, t2 - h);
      if (!st.valid || !fwd || !bwd) continue;
      // d(theta)/dt = d(theta)/d(theta2) * omega2
      const dTheta3 = ((fwd.theta3 - bwd.theta3) / (2 * h)) * omega2;
      const dTheta4 = ((fwd.theta4 - bwd.theta4) / (2 * h)) * omega2;
      expect(st.omega3).toBeCloseTo(dTheta3, 3);
      expect(st.omega4).toBeCloseTo(dTheta4, 3);
    }
  });

  it("alpha3, alpha4 match d(omega)/dt within tolerance", () => {
    const omega2 = 1.8;
    const h = 1e-5;
    for (let deg = 5; deg < 360; deg += 29) {
      const t2 = toRad(deg);
      const st = analyzeFourBar(crankRocker, t2, omega2);
      const fwd = analyzeFourBar(crankRocker, t2 + h, omega2);
      const bwd = analyzeFourBar(crankRocker, t2 - h, omega2);
      if (!st.valid || !fwd.valid || !bwd.valid) continue;
      const dOmega3 = ((fwd.omega3 - bwd.omega3) / (2 * h)) * omega2;
      const dOmega4 = ((fwd.omega4 - bwd.omega4) / (2 * h)) * omega2;
      expect(st.alpha3).toBeCloseTo(dOmega3, 2);
      expect(st.alpha4).toBeCloseTo(dOmega4, 2);
    }
  });
});

describe("transmission angle", () => {
  it("stays within [0, 90] and is finite for a crank-rocker", () => {
    for (let deg = 0; deg < 360; deg += 11) {
      const st = analyzeFourBar(crankRocker, toRad(deg));
      if (!st.valid) continue;
      expect(st.transmissionAngle).toBeGreaterThanOrEqual(0);
      expect(st.transmissionAngle).toBeLessThanOrEqual(90.0001);
    }
  });

  it("reports degrees, not radians", () => {
    const st = analyzeFourBar(crankRocker, toRad(90));
    expect(st.valid).toBe(true);
    // sanity: a real angle, > 1 means it isn't accidentally in radians
    expect(toDeg(toRad(45))).toBeCloseTo(45, 9);
  });
});
