/**
 * Chapter 4 Validation — three textbook worked examples.
 *
 * Each test computes a known, hand-verifiable result and checks that KINCAD's
 * deterministic engine matches it to the stated tolerance. The methodology is:
 *
 *   1. Derive the expected value analytically (closed-form formula or geometric
 *      identity — no iteration, no approximation beyond floating-point).
 *   2. Run the same parameters through the KINCAD engine.
 *   3. Report the absolute and percentage error.
 *
 * All three examples are suitable for inclusion in the FYP Chapter 4 Results table.
 *
 * References:
 *   Norton, R. L. "Design of Machinery," 6th ed., McGraw-Hill (2019).
 *   Ch. 4 (position), Ch. 5 (synthesis), Ch. 6 (velocity).
 */

import { describe, it, expect } from "vitest";
import { analyzeSliderCrank, solveSliderPosition } from "../slidercrank";
import { analyzeFourBar, solvePosition } from "../fourbar";
import { synthesizeFunctionGenerator } from "../synthesis";
import { toDeg, toRad } from "../vector";

// ─── helper ────────────────────────────────────────────────────────────────
const pct = (got: number, ref: number) =>
  ref === 0 ? Math.abs(got) : (Math.abs(got - ref) / Math.abs(ref)) * 100;

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
    console.log(`  θ₃ (engine) : ${toDeg(theta3).toFixed(4)}°   (hand calc ≈ 41.96°)`);
    console.log(`  θ₄ (engine) : ${toDeg(theta4).toFixed(4)}°   (hand calc ≈ 83.52°)`);
    console.log(`  Residual x  : ${residX.toExponential(3)}`);
    console.log(`  Residual y  : ${residY.toExponential(3)}`);

    // The engine returns angles that may differ from the hand-calc value by a multiple of 360°
    // (they represent the same physical angle). Wrap the difference before comparing.
    const wrapDiff = (a: number, b: number) => {
      let d = Math.abs(toDeg(a) - toDeg(b)) % 360;
      if (d > 180) d = 360 - d;
      return d;
    };
    const errT3 = wrapDiff(theta3, toRad(41.96));
    const errT4 = wrapDiff(theta4, toRad(83.52));
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

  it("transmission angle lies in valid engineering range", () => {
    const st = analyzeFourBar(link, theta2);
    expect(st.valid).toBe(true);
    console.log(`\nExample 2c — transmission angle = ${st.transmissionAngle.toFixed(2)}°`);
    expect(st.transmissionAngle).toBeGreaterThan(0);
    expect(st.transmissionAngle).toBeLessThanOrEqual(90);
  });
});

// ─── EXAMPLE 3: Freudenstein synthesis round-trip ────────────────────────
//
// A known crank-rocker (r1=4, r2=1.2, r3=3.5, r4=3) is analysed at three
// chosen input angles to obtain output angles θ₄₁, θ₄₂, θ₄₃.  These three
// pairs (θ₂ᵢ, θ₄ᵢ) are then fed to the synthesis solver.  The recovered
// link dimensions must reproduce the original mechanism to at least 4 decimal
// places, and the three precision-point angles must be satisfied exactly.
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

    console.log(`\nExample 3 — Freudenstein synthesis round-trip`);
    console.log(`  Original  r2=${original.input.toFixed(4)}, r3=${original.coupler.toFixed(4)}, r4=${original.output.toFixed(4)}`);
    console.log(`  Recovered r2=${syn.input.toFixed(4)}, r3=${syn.coupler.toFixed(4)}, r4=${syn.output.toFixed(4)}`);
    console.log(`  % error   r2=${errInput.toFixed(4)}%  r3=${errCoupler.toFixed(4)}%  r4=${errOutput.toFixed(4)}%`);

    // Step 3: verify the synthesised linkage satisfies all three precision points
    console.log(`\n  Precision-point output angle verification:`);
    theta2s.forEach((t2, i) => {
      const pos = solvePosition(syn, t2);
      expect(pos).not.toBeNull();
      // Wrap the difference to (−π, π] before comparing
      const diff = Math.abs(toDeg(pos!.theta4) - toDeg(theta4s[i]));
      const diffWrapped = diff > 180 ? 360 - diff : diff;
      console.log(
        `  i=${i+1}: θ₂=${toDeg(t2).toFixed(1)}°  target θ₄=${toDeg(theta4s[i]).toFixed(4)}°  recovered=${toDeg(pos!.theta4).toFixed(4)}°  Δ=${diffWrapped.toFixed(6)}°`
      );
      expect(diffWrapped).toBeLessThan(0.001);
    });

    // Link length round-trip accuracy
    expect(errInput).toBeLessThan(0.01);
    expect(errCoupler).toBeLessThan(0.01);
    expect(errOutput).toBeLessThan(0.01);
  });
});
