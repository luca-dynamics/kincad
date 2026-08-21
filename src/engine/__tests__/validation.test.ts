/**
 * Chapter 4 Validation — textbook worked examples and independent checks.
 *
 * Each test computes a known, hand-verifiable result and checks that KINCAD's
 * deterministic engine matches it to the stated tolerance. The methodology is:
 *
 *   1. Derive the expected value analytically (closed-form formula or geometric
 *      identity — no iteration, no approximation beyond floating-point).
 *   2. Run the same parameters through the KINCAD engine.
 *   3. Report the absolute and percentage error.
 *
 * ANGLE CONVENTION. The solvers return the raw output of atan2 after the half-angle tangent
 * substitution, which lies in (−360°, 360°] — so a physically identical position can be reported
 * as either θ or θ − 360°. Every angle logged here is wrapped into [0, 360°) with wrap2Pi first,
 * and every comparison against a reference wraps the DIFFERENCE. Reporting a raw −317.9640° next
 * to a hand-calculated 41.9600° and calling it an error of 359.92° would be an artefact of the
 * convention, not a discrepancy in the result.
 *
 * SCOPE. These are kinematic checks only — position, velocity, acceleration and the geometry that
 * follows from them. No force, stress, inertia or dynamic analysis is performed anywhere in
 * KINCAD, so nothing here should be read as validating those.
 *
 * UNITS. Lengths are dimensionless and only their ratios matter; interpret them in any consistent
 * unit (mm throughout the CAD side). Angular velocity is rad/s, angular acceleration rad/s², and
 * linear velocity is (length unit)/s at the same length unit as the links.
 *
 * WHAT THESE TESTS CANNOT DO. A hand calculation is one sample at one input angle, and a
 * round-trip through the same solver is that solver twice. Neither can catch an error that varies
 * smoothly over the cycle. That gap is covered separately by crosscheck.test.ts, which recomputes
 * position by circle-circle intersection and motion by central differences and requires agreement
 * over a full 360° sweep.
 *
 * References:
 *   Norton, R. L. "Design of Machinery," 6th ed., McGraw-Hill (2019).
 *   Ch. 4 (position), Ch. 5 (synthesis), Ch. 6 (velocity).
 */

import { describe, it, expect } from "vitest";
import { analyzeSliderCrank, solveSliderPosition } from "../slidercrank";
import { analyzeFourBar, solvePosition } from "../fourbar";
import { synthesizeFunctionGenerator } from "../synthesis";
import { toDeg, toRad, wrap2Pi } from "../vector";
import { assembliesByIntersection } from "./independent";

// ─── helper ────────────────────────────────────────────────────────────────
const pct = (got: number, ref: number) =>
  ref === 0 ? Math.abs(got) : (Math.abs(got - ref) / Math.abs(ref)) * 100;

/** Report an angle the way the app reports it: degrees wrapped into [0, 360). */
const degWrapped = (rad: number) => toDeg(wrap2Pi(rad));

/** |a − b| in degrees, wrapped into [0, 180] so the ±360° convention cannot inflate it. */
const wrapDiffDeg = (a: number, b: number) => {
  let d = Math.abs(toDeg(a) - toDeg(b)) % 360;
  if (d > 180) d = 360 - d;
  return d;
};

// ─── EXAMPLE 1: Slider-crank — exact positions at TDC, BDC, and 90° ───────
//
// Mechanism: crank a = 1, rod b = 4, offset e = 0 (inline).
// These positions admit exact closed-form solutions (no rounding in reference).
//
//   TDC (θ₂ = 0°):   x = a + b = 5,  θ₃ = 0°          (exact)
//   BDC (θ₂ = 180°): x = b − a = 3,  θ₃ = 0°          (exact)
//   θ₂ = 90°:        x = √(b²−a²) = √15,  θ₃ = atan2(−a, √15)  (exact)
// ──────────────────────────────────────────────────────────────────────────
describe("Example 1 — Slider-crank inline (crank=1, rod=4, offset=0)", () => {
  const link = { crank: 1, rod: 4, offset: 0 };

  it("TDC (θ₂=0°): slider position = crank + rod = 5 exactly", () => {
    const r = solveSliderPosition(link, 0);
    expect(r).not.toBeNull();
    const xExpected = link.crank + link.rod; // 5.0 — exact geometric identity
    const error = pct(r!.x, xExpected);
    console.log(`\nExample 1a — TDC slider position`);
    console.log(`  Expected : ${xExpected.toFixed(6)}`);
    console.log(`  KINCAD   : ${r!.x.toFixed(6)}`);
    console.log(`  Error    : ${error.toExponential(2)} %`);
    expect(error).toBeLessThan(1e-9); // machine precision
  });

  it("BDC (θ₂=180°): slider position = rod − crank = 3 exactly", () => {
    const r = solveSliderPosition(link, Math.PI);
    expect(r).not.toBeNull();
    const xExpected = link.rod - link.crank; // 3.0 — exact
    const error = pct(r!.x, xExpected);
    console.log(`\nExample 1b — BDC slider position`);
    console.log(`  Expected : ${xExpected.toFixed(6)}`);
    console.log(`  KINCAD   : ${r!.x.toFixed(6)}`);
    console.log(`  Error    : ${error.toExponential(2)} %`);
    expect(error).toBeLessThan(1e-9);
  });

  it("θ₂=90°: slider position = √(rod²−crank²) = √15 ≈ 3.872983 exactly", () => {
    const r = solveSliderPosition(link, Math.PI / 2);
    expect(r).not.toBeNull();
    const xExpected = Math.sqrt(link.rod ** 2 - link.crank ** 2); // √15 — exact
    const theta3Expected = Math.atan2(-link.crank, xExpected); // atan2(−1, √15) — exact
    const errorX = pct(r!.x, xExpected);
    const errorT3 = pct(r!.theta3, theta3Expected);
    console.log(`\nExample 1c — θ₂=90° slider position and rod angle`);
    console.log(`  x  expected : ${xExpected.toFixed(6)}   KINCAD: ${r!.x.toFixed(6)}   error: ${errorX.toExponential(2)} %`);
    console.log(`  θ₃ expected : ${toDeg(theta3Expected).toFixed(4)}°  KINCAD: ${toDeg(r!.theta3).toFixed(4)}°  error: ${errorT3.toExponential(2)} %`);
    expect(errorX).toBeLessThan(1e-9);
    expect(errorT3).toBeLessThan(1e-9);
  });

  it("θ₂=90°: slider velocity = −r·ω₂·[1 + r·cos(0)/√15] analytically", () => {
    const omega2 = 10; // rad/s
    const st = analyzeSliderCrank(link, Math.PI / 2, omega2);
    // dX/dθ₂ at θ₂=90°: = −a·sin(90°) − a²·sin(90°)·cos(90°)/s  = −a·1 − 0 = −a
    // v = dX/dθ₂ · ω₂ = −a·ω₂ = −1 × 10 = −10
    const vExpected = -link.crank * omega2; // −10 exactly
    const error = pct(st.sliderVel, vExpected);
    console.log(`\nExample 1d — θ₂=90° slider velocity`);
    console.log(`  Expected : ${vExpected.toFixed(6)}`);
    console.log(`  KINCAD   : ${st.sliderVel.toFixed(6)}`);
    console.log(`  Error    : ${error.toExponential(2)} %`);
    expect(error).toBeLessThan(1e-8);
  });
});

// ─── EXAMPLE 2: Four-bar — loop-closure residual and Norton Eq. 6.18 velocity
//
// Mechanism: r1=6, r2=2, r3=7.8, r4=7 (Grashof crank-rocker, S+L=8 < P+Q=13.8)
// θ₂ = 60°, open circuit.
//
// Validation strategy:
//   The position solver gives θ₃, θ₄.  We check that they identically satisfy the
//   two loop-closure equations (x and y components), which is the defining criterion
//   for correctness — a textbook reference rounded to 2 d.p. is less stringent than
//   machine-precision satisfaction of the governing equations.
//
//   Manual reference (computed by hand using Freudenstein half-angle substitution):
//     θ₃ ≈ 41.96°,  θ₄ ≈ 83.52°  (hand calculation, rounded to 0.01°)
//   Loop-closure residual (from engine): should be < 1×10⁻⁸.
// ──────────────────────────────────────────────────────────────────────────
describe("Example 2 — Four-bar crank-rocker (r1=6, r2=2, r3=7.8, r4=7, θ₂=60°)", () => {
  const link = {
    ground: 6, input: 2, coupler: 7.8, output: 7,
    couplerPointDist: 0, couplerPointAngle: 0, circuit: "open" as const,
  };
  const theta2 = toRad(60);

  it("position: satisfies vector loop-closure equations to < 1×10⁻⁸", () => {
    const pos = solvePosition(link, theta2);
    expect(pos).not.toBeNull();
    const { theta3, theta4 } = pos!;

    // x-equation: r2·cos(θ2) + r3·cos(θ3) − r4·cos(θ4) − r1 = 0
    const residX =
      link.input * Math.cos(theta2) +
      link.coupler * Math.cos(theta3) -
      link.output * Math.cos(theta4) -
      link.ground;
    // y-equation: r2·sin(θ2) + r3·sin(θ3) − r4·sin(θ4) = 0
    const residY =
      link.input * Math.sin(theta2) +
      link.coupler * Math.sin(theta3) -
      link.output * Math.sin(theta4);

    console.log(`\nExample 2a — four-bar position loop-closure residual`);
    // Report the wrapped angle — the same value the UI and the PDF report show. The raw solver
    // output for theta3 here is -317.9640 rad-equivalent-degrees, which is the SAME direction as
    // 42.0360°; printing the raw number beside a hand calc of 41.96° would invent a 360° error.
    console.log(`  θ₃ (engine) : ${degWrapped(theta3).toFixed(4)}°   (raw solver output ${toDeg(theta3).toFixed(4)}°; hand calc ≈ 41.96°)`);
    console.log(`  θ₄ (engine) : ${degWrapped(theta4).toFixed(4)}°   (raw solver output ${toDeg(theta4).toFixed(4)}°; hand calc ≈ 83.52°)`);
    console.log(`  Residual x  : ${residX.toExponential(3)}`);
    console.log(`  Residual y  : ${residY.toExponential(3)}`);

    const errT3 = wrapDiffDeg(theta3, toRad(41.96));
    const errT4 = wrapDiffDeg(theta4, toRad(83.52));
    console.log(`  |θ₃ − hand| (wrapped) : ${errT3.toFixed(4)}°`);
    console.log(`  |θ₄ − hand| (wrapped) : ${errT4.toFixed(4)}°`);

    expect(Math.abs(residX)).toBeLessThan(1e-8);
    expect(Math.abs(residY)).toBeLessThan(1e-8);
    // Should agree with hand calc (to within hand-calc rounding of 0.01°, allow 0.1° margin)
    expect(errT3).toBeLessThan(0.10);
    expect(errT4).toBeLessThan(0.10);
  });

  it("velocity: ω₃ and ω₄ satisfy Norton Eq. 6.18 velocity loop exactly", () => {
    const omega2 = 1;
    const st = analyzeFourBar(link, theta2, omega2);
    expect(st.valid).toBe(true);

    // Velocity loop (differentiated closure): Norton Eq. 6.18
    //   −r2·ω2·sin(θ2) − r3·ω3·sin(θ3) + r4·ω4·sin(θ4) = 0
    //    r2·ω2·cos(θ2) + r3·ω3·cos(θ3) − r4·ω4·cos(θ4) = 0
    const velResidX =
      -link.input * omega2 * Math.sin(theta2) -
      link.coupler * st.omega3 * Math.sin(st.theta3) +
      link.output * st.omega4 * Math.sin(st.theta4);
    const velResidY =
      link.input * omega2 * Math.cos(theta2) +
      link.coupler * st.omega3 * Math.cos(st.theta3) -
      link.output * st.omega4 * Math.cos(st.theta4);

    // Manual reference (hand-computed via Norton Eq. 6.18 at θ₂=60°):
    //   ω₃ ≈ −0.154 rad/s,  ω₄ ≈  0.133 rad/s  (to 3 sig. fig.)
    const handOmega3 = -0.154;
    const handOmega4 =  0.133;

    console.log(`\nExample 2b — four-bar velocity`);
    console.log(`  ω₃ (engine) : ${st.omega3.toFixed(5)} rad/s   (hand ≈ ${handOmega3})`);
    console.log(`  ω₄ (engine) : ${st.omega4.toFixed(5)} rad/s   (hand ≈ ${handOmega4})`);
    console.log(`  Vel residual x : ${velResidX.toExponential(3)}`);
    console.log(`  Vel residual y : ${velResidY.toExponential(3)}`);
    console.log(`  % error ω₃  : ${pct(st.omega3, handOmega3).toFixed(2)} %`);
    console.log(`  % error ω₄  : ${pct(st.omega4, handOmega4).toFixed(2)} %`);

    // Velocity loop residual must be < 1e-8 (machine precision)
    expect(Math.abs(velResidX)).toBeLessThan(1e-8);
    expect(Math.abs(velResidY)).toBeLessThan(1e-8);
    // Must agree with 3-sig-fig hand calculation to within its own rounding (< 2%)
    expect(pct(st.omega3, handOmega3)).toBeLessThan(2);
    expect(pct(st.omega4, handOmega4)).toBeLessThan(2);
  });

  it("transmission angle matches the law of cosines on the coupler-output triangle", () => {
    const st = analyzeFourBar(link, theta2);
    expect(st.valid).toBe(true);

    // Independent reference. The engine takes mu from theta3 - theta4; this takes it from the
    // triangle formed by the coupler, the output link and the diagonal from the input tip A to the
    // fixed pivot O4 — no angle from the solver enters the calculation at all.
    //   L² = d² + a² − 2ad·cos(θ₂)                    (triangle O2-A-O4)
    //   cos(mu) = (b² + c² − L²) / (2bc)              (triangle A-B-O4)
    const L2 =
      link.ground ** 2 + link.input ** 2 -
      2 * link.ground * link.input * Math.cos(theta2);
    const cosMu =
      (link.coupler ** 2 + link.output ** 2 - L2) / (2 * link.coupler * link.output);
    const muRef = toDeg(Math.acos(cosMu)); // 41.4572°, and by hand: 81.84 / 109.2 = 0.749451

    console.log(`\nExample 2c — transmission angle`);
    console.log(`  Reference (law of cosines) : ${muRef.toFixed(4)}°`);
    console.log(`  KINCAD                     : ${st.transmissionAngle.toFixed(4)}°`);
    console.log(`  Error                      : ${pct(st.transmissionAngle, muRef).toExponential(2)} %`);

    expect(st.transmissionAngle).toBeCloseTo(muRef, 9);
    // And it is reported in the engineering convention: folded into (0, 90°].
    expect(st.transmissionAngle).toBeGreaterThan(0);
    expect(st.transmissionAngle).toBeLessThanOrEqual(90);
  });
});

// ─── EXAMPLE 3: Freudenstein synthesis round-trip — CONSISTENCY, not validation
//
// A known crank-rocker (r1=4, r2=1.2, r3=3.5, r4=3) is analysed at three chosen input angles to
// obtain output angles θ₄₁, θ₄₂, θ₄₃.  Those three pairs (θ₂ᵢ, θ₄ᵢ) are then fed to the synthesis
// solver, and the recovered dimensions must reproduce the original mechanism.
//
// READ THIS BEFORE QUOTING THE RESULT. This is a self-consistency check, and it is weaker than it
// looks. The targets are produced by solvePosition and then verified with solvePosition, so any
// error present in BOTH directions cancels exactly and the round-trip still closes to 1e-6°. It
// demonstrates that the synthesis inverts the analysis; it cannot demonstrate that either one is
// correct. It is also a soft case: because the targets come from a linkage that already has
// positive Freudenstein ratios, it never exercises the negative-ratio path — which is how a real
// defect in the synthesis survived this test (see Example 4).
//
// Example 4 is the check that can actually falsify the synthesis.
// ──────────────────────────────────────────────────────────────────────────
describe("Example 3 — Freudenstein synthesis round-trip (r1=4, r2=1.2, r3=3.5, r4=3)", () => {
  const original = {
    ground: 4, input: 1.2, coupler: 3.5, output: 3,
    couplerPointDist: 0, couplerPointAngle: 0, circuit: "open" as const,
  };

  // Three precision points (input angles chosen to be well-spread)
  const theta2s = [toRad(40), toRad(90), toRad(160)];

  it("recovered link lengths match original to < 0.01% and output angles to < 0.001°", () => {
    // Step 1: obtain θ₄ at the three precision points via the analysis engine
    const theta4s = theta2s.map((t2) => {
      const pos = solvePosition(original, t2);
      expect(pos).not.toBeNull();
      return pos!.theta4;
    });

    // Step 2: synthesise from the three (θ₂, θ₄) pairs
    const result = synthesizeFunctionGenerator({
      theta2: [theta2s[0], theta2s[1], theta2s[2]],
      theta4: [theta4s[0], theta4s[1], theta4s[2]],
      ground: original.ground,
    });

    expect(result.feasible).toBe(true);
    const syn = result.link!;

    const errInput   = pct(syn.input,   original.input);
    const errCoupler = pct(syn.coupler, original.coupler);
    const errOutput  = pct(syn.output,  original.output);

    console.log(`\nExample 3 — Freudenstein synthesis round-trip (consistency check)`);
    console.log(`  Original  r2=${original.input.toFixed(4)}, r3=${original.coupler.toFixed(4)}, r4=${original.output.toFixed(4)}`);
    console.log(`  Recovered r2=${syn.input.toFixed(4)}, r3=${syn.coupler.toFixed(4)}, r4=${syn.output.toFixed(4)}`);
    console.log(`  % error   r2=${errInput.toFixed(4)}%  r3=${errCoupler.toFixed(4)}%  r4=${errOutput.toFixed(4)}%`);

    // Step 3: verify the synthesised linkage satisfies all three precision points
    console.log(`\n  Precision-point output angle verification (same solver both ways):`);
    theta2s.forEach((t2, i) => {
      const pos = solvePosition(syn, t2);
      expect(pos).not.toBeNull();
      const diffWrapped = wrapDiffDeg(pos!.theta4, theta4s[i]);
      console.log(
        `  i=${i+1}: θ₂=${degWrapped(t2).toFixed(1)}°  target θ₄=${degWrapped(theta4s[i]).toFixed(4)}°  recovered=${degWrapped(pos!.theta4).toFixed(4)}°  Δ=${diffWrapped.toFixed(6)}°`
      );
      expect(diffWrapped).toBeLessThan(0.001);
    });

    // Link length round-trip accuracy
    expect(errInput).toBeLessThan(0.01);
    expect(errCoupler).toBeLessThan(0.01);
    expect(errOutput).toBeLessThan(0.01);
  });
});

// ─── EXAMPLE 4: Freudenstein synthesis from PRESCRIBED precision points ───
//
// The check Example 3 cannot make. Here the three (θ₂, θ₄) correspondences are chosen a priori —
// round numbers a designer would specify — instead of being read back out of the analysis solver.
// The synthesised linkage is then verified three ways, none of which is the code under test:
//
//   (1) Freudenstein's equation written out directly from its definition below;
//   (2) circle-circle intersection (independent.ts) — pure geometry, no Freudenstein at all;
//   (3) the analysis engine itself, for completeness.
//
// This case found a real defect. The synthesis legitimately produces NEGATIVE Freudenstein ratios
// (K1 = d/a < 0), which the implementation read as negative link LENGTHS and refused as
// "non-physical". Substituting θ₂+π and θ₄+π into Freudenstein's equation gives K1′ = d/|a|,
// K2′ = d/|c| and K3′ = K3 — the identical equation — so a negative ratio means only that the link
// points opposite the assumed datum, and the mechanism is buildable with positive lengths at a
// datum rotated 180°. The solver now reports that rotation instead of refusing the job. Across a
// grid of 81 ordinary specifications at d = 4, the old guard accepted 31 and the corrected solver
// accepts 77; the 4 refusals that remain are genuine (3 singular systems, 1 non-assemblable).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Freudenstein's equation, straight from the definition, independent of the code that solves it:
 *   K1·cos θ₄ − K2·cos θ₂ + K3 = cos(θ₂ − θ₄)
 */
function freudensteinResidual(
  link: { ground: number; input: number; coupler: number; output: number },
  theta2: number,
  theta4: number,
): number {
  const { ground: d, input: a, coupler: b, output: c } = link;
  const K1 = d / a;
  const K2 = d / c;
  const K3 = (a * a - b * b + c * c + d * d) / (2 * a * c);
  return K1 * Math.cos(theta4) - K2 * Math.cos(theta2) + K3 - Math.cos(theta2 - theta4);
}

describe("Example 4 — Freudenstein synthesis, prescribed precision points (d = 4)", () => {
  const SPECS = [
    { theta2Deg: [40, 90, 160], theta4Deg: [50, 80, 110] },
    { theta2Deg: [30, 75, 120], theta4Deg: [60, 90, 120] },
    { theta2Deg: [45, 90, 135], theta4Deg: [95, 120, 145] },
    { theta2Deg: [30, 60, 90], theta4Deg: [35, 55, 75] },
  ];

  for (const [n, spec] of SPECS.entries()) {
    const label = `θ₂ ${spec.theta2Deg.join("/")}° → θ₄ ${spec.theta4Deg.join("/")}°`;

    it(`threads all three prescribed points — spec ${"ABCD"[n]}: ${label}`, () => {
      const theta2 = spec.theta2Deg.map(toRad) as [number, number, number];
      const theta4 = spec.theta4Deg.map(toRad) as [number, number, number];
      const res = synthesizeFunctionGenerator({ theta2, theta4, ground: 4 });

      expect(res.feasible).toBe(true);
      const link = res.link!;

      console.log(`\nExample 4${"abcd"[n]} — prescribed ${label}`);
      console.log(
        `  Synthesised: r1=${link.ground.toFixed(6)}  r2=${link.input.toFixed(6)}  r3=${link.coupler.toFixed(6)}  r4=${link.output.toFixed(6)}  [${link.circuit}]`,
      );
      console.log(
        `  Datum rotation: input ${degWrapped(res.inputOffset).toFixed(1)}°, output ${degWrapped(res.outputOffset).toFixed(1)}°`,
      );

      let worstFreud = 0;
      let worstGeom = 0;
      let worstEngine = 0;

      for (let i = 0; i < 3; i++) {
        const wantT2 = theta2[i] + res.inputOffset;
        const wantT4 = theta4[i] + res.outputOffset;

        // (1) the defining equation
        const resid = Math.abs(freudensteinResidual(link, wantT2, wantT4));

        // (2) independent geometry: one of the two assembly circuits must land on the target
        const roots = assembliesByIntersection(link, wantT2);
        expect(roots).not.toBeNull();
        const geomErr = Math.min(
          ...roots!.map((r) => wrapDiffDeg(r.theta4, wantT4)),
        );

        // (3) the analysis engine, driven at the circuit the synthesis reported
        const pos = solvePosition(link, wantT2);
        expect(pos).not.toBeNull();
        const engineErr = wrapDiffDeg(pos!.theta4, wantT4);

        console.log(
          `  i=${i + 1}: θ₂=${degWrapped(wantT2).toFixed(1)}° → θ₄=${degWrapped(wantT4).toFixed(1)}°  ` +
            `Freudenstein resid ${resid.toExponential(2)}  geometry Δ ${geomErr.toExponential(2)}°  engine Δ ${engineErr.toExponential(2)}°`,
        );

        worstFreud = Math.max(worstFreud, resid);
        worstGeom = Math.max(worstGeom, geomErr);
        worstEngine = Math.max(worstEngine, engineErr);
      }

      expect(worstFreud).toBeLessThan(1e-9);
      expect(worstGeom).toBeLessThan(1e-8);
      expect(worstEngine).toBeLessThan(1e-8);
    });
  }

  it("still refuses a specification that is genuinely impossible", () => {
    // The corrected solver must not become permissive. Three identical input angles make the 3x3
    // system singular, and no datum rotation can rescue that.
    const singular = synthesizeFunctionGenerator({
      theta2: [toRad(10), toRad(10), toRad(10)],
      theta4: [toRad(20), toRad(40), toRad(60)],
    });
    console.log(`\nExample 4e — singular specification correctly refused: "${singular.notes}"`);
    expect(singular.feasible).toBe(false);
    expect(singular.link).toBeNull();
  });
});
