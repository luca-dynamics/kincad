// Cross-check the analysis engine against WHOLLY INDEPENDENT methods.
//
// src/engine/fourbar.ts solves position by the half-angle-tangent quadratic (Norton Eq. 4.10 /
// 4.13) and gets velocity and acceleration by differentiating the loop equation analytically
// (Eq. 6.18 / 7.12). This file recomputes all of it a different way — position by circle-circle
// intersection, motion by central differences (src/engine/__tests__/independent.ts) — and
// requires the two to agree over a whole cycle.
//
// Why this test exists: the pre-existing validation suite checked the engine against itself
// (generate targets with solvePosition, verify them with solvePosition) and against three hand
// calculations at single input angles. Neither can catch an error that is smooth in theta2 — a
// wrong branch over part of the cycle, a sign slip in the acceleration coupling — because a
// hand check at one angle is one sample and a round-trip is the same code twice. Two methods
// disagreeing is evidence; one method agreeing with itself is not.

import { describe, it, expect } from "vitest";
import { analyzeFourBar, solvePosition } from "../fourbar";
import type { FourBarLinkage } from "../types";
import {
  angleDelta,
  assembliesByIntersection,
  matchRoot,
  motionByFiniteDifference,
} from "./independent";

const DEG = Math.PI / 180;

const base = { couplerPointDist: 1, couplerPointAngle: 0 };

const CASES: {
  name: string;
  link: FourBarLinkage;
  /** Assemblable samples out of 360 — pins the reachable arc, not just its existence. */
  samples: number;
  minMotionSamples: number;
}[] = [
  {
    // The geometry used for the Chapter 4 hand calculation, swept over the full cycle.
    name: "crank-rocker, open circuit",
    link: { ...base, ground: 6, input: 2, coupler: 7.8, output: 7, circuit: "open" },
    samples: 360,
    minMotionSamples: 350,
  },
  {
    name: "crank-rocker, crossed circuit",
    link: { ...base, ground: 6, input: 2, coupler: 7.8, output: 7, circuit: "crossed" },
    samples: 360,
    minMotionSamples: 350,
  },
  {
    // s + l = 2 + 6 = 8 > p + q = 3 + 3 = 6, so the crank only rocks: part of the cycle is
    // non-assemblable and both solvers must decline on exactly the same arc.
    name: "non-Grashof triple-rocker, partial arc",
    link: { ...base, ground: 6, input: 2, coupler: 3, output: 3, circuit: "open" },
    samples: 161,
    minMotionSamples: 140,
  },
  {
    // Drag link (ground shortest): both input and output fully rotate, so theta4 winds past
    // +-pi repeatedly — the case where a seam-handling mistake would show up.
    name: "drag-link double-crank",
    link: { ...base, ground: 2, input: 5, coupler: 4.5, output: 5, circuit: "open" },
    samples: 360,
    minMotionSamples: 350,
  },
];

describe("cross-check vs circle-circle intersection (independent position method)", () => {
  for (const c of CASES) {
    it(`agrees on theta3 and theta4 across the full cycle — ${c.name}`, () => {
      let checked = 0;
      let root: 0 | 1 | null = null;
      let worst3 = 0;
      let worst4 = 0;

      for (let i = 0; i < 360; i++) {
        const theta2 = i * DEG;
        const engine = solvePosition(c.link, theta2);
        const roots = assembliesByIntersection(c.link, theta2);

        // Both methods must agree on whether the linkage assembles at all.
        expect(engine === null).toBe(roots === null);
        if (!engine || !roots) continue;

        // Resolve the branch ONCE, then hold it. Re-matching per sample would hide a
        // mid-sweep circuit jump, which is the failure this sweep is here to detect.
        if (root === null) {
          root = matchRoot(roots, engine.theta4);
          expect(root).not.toBeNull();
        }
        const ref = roots[root!];

        worst4 = Math.max(worst4, Math.abs(angleDelta(engine.theta4, ref.theta4)));
        worst3 = Math.max(worst3, Math.abs(angleDelta(engine.theta3, ref.theta3)));
        checked++;
      }

      expect(checked).toBe(c.samples);
      // Two different closed-form routes to the same geometry: agreement is at round-off.
      // Measured worst over the four cases: 1.4e-14 rad.
      console.log(
        `\nPosition cross-check — ${c.name}\n` +
          `  Assemblable samples : ${checked} of 360\n` +
          `  Worst |Δθ₃|         : ${worst3.toExponential(2)} rad\n` +
          `  Worst |Δθ₄|         : ${worst4.toExponential(2)} rad`,
      );
      expect(worst4).toBeLessThan(1e-12);
      expect(worst3).toBeLessThan(1e-12);
    });
  }
});

describe("cross-check vs central differences (independent velocity/acceleration method)", () => {
  for (const c of CASES) {
    it(`agrees on omega and alpha away from toggle — ${c.name}`, () => {
      const omega2 = 2.5; // a non-unit rate, so a missing omega2 factor cannot hide
      const link = c.link;
      let checked = 0;
      let root: 0 | 1 | null = null;
      let worstOmega = 0;
      let worstAlpha = 0;

      for (let i = 0; i < 360; i++) {
        const theta2 = i * DEG;
        const st = analyzeFourBar(link, theta2, omega2, 0);
        const roots = assembliesByIntersection(link, theta2);
        if (!st.valid || !roots) continue;
        if (root === null) root = matchRoot(roots, st.theta4);
        if (root === null) continue;

        // Near a toggle the two circuits merge, the derivatives are unbounded and the third
        // derivative — which sets a central difference's truncation error — blows up with them.
        // Excluding that neighbourhood is a limitation of the REFERENCE method, not of the
        // engine, so it is gated explicitly and stated, rather than absorbed by loosening the
        // tolerance for all 360 samples. At this gate the worst-conditioned case (the triple
        // rocker) reaches the same accuracy floor as the well-conditioned ones.
        if (roots[root].halfChord < 0.2 * link.coupler) continue;

        const fd = motionByFiniteDifference(link, theta2, root, omega2);
        if (!fd) continue;

        const rel = (engineValue: number, reference: number) =>
          Math.abs(engineValue - reference) / Math.max(1, Math.abs(reference));

        worstOmega = Math.max(worstOmega, rel(st.omega3, fd.omega3), rel(st.omega4, fd.omega4));
        worstAlpha = Math.max(worstAlpha, rel(st.alpha3, fd.alpha3), rel(st.alpha4, fd.alpha4));
        checked++;
      }

      expect(checked).toBeGreaterThanOrEqual(c.minMotionSamples);
      // Central differences carry O(h^2) truncation plus round-off, so these bounds are set by
      // the REFERENCE, not the engine. Measured worst across the four cases: 2.1e-7 on omega,
      // 8.0e-7 on alpha.
      console.log(
        `\nMotion cross-check — ${c.name}   (ω₂ = ${omega2} rad/s, toggle gate = 0.2 × coupler)\n` +
          `  Samples off the gate : ${checked} of 360\n` +
          `  Worst relative Δω    : ${worstOmega.toExponential(2)}\n` +
          `  Worst relative Δα    : ${worstAlpha.toExponential(2)}`,
      );
      expect(worstOmega).toBeLessThan(1e-6);
      expect(worstAlpha).toBeLessThan(1e-5);
    });
  }

  it("shows the toggle gate bounds the REFERENCE method, not the engine", () => {
    // The 0.2 x coupler gate above is a constant, and a constant chosen to make a test pass is
    // indistinguishable from a constant chosen because it is right. This sweeps it.
    //
    // If the engine were wrong near toggle, tightening the gate (admitting samples closer to the
    // singularity) would leave the disagreement roughly flat, or move it erratically. If instead
    // the CENTRAL DIFFERENCE is what degrades, the disagreement must fall monotonically as the gate
    // widens, because its O(h^2) truncation term scales with the third derivative and that is what
    // blows up at a toggle. The worst-conditioned case is the triple rocker, whose assemblable arc
    // ENDS at a toggle at both ends, so it is the one to measure.
    const link = CASES[2].link;
    const omega2 = 2.5;
    const rows: { gate: number; kept: number; worstOmega: number }[] = [];

    for (const gate of [0.05, 0.1, 0.2, 0.3]) {
      let root: 0 | 1 | null = null;
      let worstOmega = 0;
      let kept = 0;
      for (let i = 0; i < 360; i++) {
        const theta2 = i * DEG;
        const st = analyzeFourBar(link, theta2, omega2, 0);
        const roots = assembliesByIntersection(link, theta2);
        if (!st.valid || !roots) continue;
        if (root === null) root = matchRoot(roots, st.theta4);
        if (root === null) continue;
        if (roots[root].halfChord < gate * link.coupler) continue;
        const fd = motionByFiniteDifference(link, theta2, root, omega2);
        if (!fd) continue;
        const rel = (e: number, r: number) => Math.abs(e - r) / Math.max(1, Math.abs(r));
        worstOmega = Math.max(worstOmega, rel(st.omega3, fd.omega3), rel(st.omega4, fd.omega4));
        kept++;
      }
      rows.push({ gate, kept, worstOmega });
    }

    console.log(
      `\nToggle-gate sensitivity — ${CASES[2].name}   (ω₂ = ${omega2} rad/s)\n` +
        rows
          .map(
            (r) =>
              `  gate ${r.gate.toFixed(2)} × coupler : ${String(r.kept).padStart(3)} samples, ` +
              `worst relative Δω ${r.worstOmega.toExponential(2)}`,
          )
          .join("\n"),
    );

    // Monotone improvement as the gate widens: the reference is what is degrading.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].worstOmega, `gate ${rows[i].gate} vs ${rows[i - 1].gate}`).toBeLessThan(
        rows[i - 1].worstOmega,
      );
    }
    // And the degradation is steep — two orders of magnitude across this range — which is the
    // signature of a truncation term blowing up, not of a constant modelling error.
    expect(rows[0].worstOmega / rows[rows.length - 1].worstOmega).toBeGreaterThan(100);
  });
});
