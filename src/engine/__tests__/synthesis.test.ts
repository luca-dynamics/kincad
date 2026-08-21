import { describe, it, expect } from "vitest";
import { synthesizeFunctionGenerator, synthesizeTwoPosition } from "../synthesis";
import { analyzeFourBar, solvePosition } from "../fourbar";
import { toRad } from "../vector";
import { assembliesByIntersection, sameDirection } from "./independent";

/**
 * Freudenstein's equation, evaluated directly. This is the DEFINITION the synthesis is supposed
 * to satisfy, written out independently of the code that solves it — no shared helper, no
 * quadratic, no coefficient recovery.
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

describe("Freudenstein function generation — prescribed precision points", () => {
  // These specs are chosen a priori: the angles are round numbers a designer would ask for,
  // NOT angles read back out of the solver. Every one of them was refused outright by the
  // earlier implementation, which treated a negative Freudenstein ratio (K1 = d/a < 0) as a
  // non-physical linkage. A negative ratio only means that link is directed opposite the
  // assumed datum; the mechanism is buildable, with positive lengths, at a datum rotated 180°.
  const SPECS = [
    { theta2Deg: [40, 90, 160], theta4Deg: [50, 80, 110] },
    { theta2Deg: [30, 75, 120], theta4Deg: [60, 90, 120] },
    { theta2Deg: [45, 90, 135], theta4Deg: [95, 120, 145] },
    { theta2Deg: [30, 60, 90], theta4Deg: [35, 55, 75] },
  ];

  for (const spec of SPECS) {
    const label = `θ₂ ${spec.theta2Deg.join("/")}° → θ₄ ${spec.theta4Deg.join("/")}°`;

    it(`threads the prescribed points — ${label}`, () => {
      const theta2 = spec.theta2Deg.map(toRad) as [number, number, number];
      const theta4 = spec.theta4Deg.map(toRad) as [number, number, number];
      const res = synthesizeFunctionGenerator({ theta2, theta4, ground: 4 });

      expect(res.feasible).toBe(true);
      expect(res.link).not.toBeNull();
      const link = res.link!;

      // Manufacturable: every length positive and finite.
      for (const L of [link.ground, link.input, link.coupler, link.output]) {
        expect(L).toBeGreaterThan(0);
        expect(Number.isFinite(L)).toBe(true);
      }
      // The datum flip is REPORTED, not silently applied.
      for (const off of [res.inputOffset, res.outputOffset]) {
        expect([0, Math.PI]).toContain(off);
      }

      for (let i = 0; i < 3; i++) {
        const wantT2 = theta2[i] + res.inputOffset;
        const wantT4 = theta4[i] + res.outputOffset;

        // (1) Independent check against the DEFINITION: the synthesised lengths must satisfy
        // Freudenstein's equation at the prescribed correspondence.
        expect(Math.abs(freudensteinResidual(link, wantT2, wantT4))).toBeLessThan(1e-9);

        // (2) Independent check by GEOMETRY: circle-circle intersection, no Freudenstein at
        // all. One of the two assembly circuits must land on the target angle — and it must be
        // the circuit the synthesis reported.
        const roots = assembliesByIntersection(link, wantT2);
        expect(roots).not.toBeNull();
        const hit = roots!.some((r) => sameDirection(r.theta4, wantT4, 1e-8));
        expect(hit).toBe(true);

        // (3) And the engine, driven at the reported circuit, must reach it too.
        const pos = solvePosition(link, wantT2);
        expect(pos).not.toBeNull();
        expect(sameDirection(pos!.theta4, wantT4, 1e-8)).toBe(true);
      }
    });
  }

  it("reports which assembly circuit the solution lies on, rather than assuming one", () => {
    // The two roots of the position quadratic both satisfy Freudenstein's equation, so the
    // circuit cannot be assumed. It used to be hardcoded "open"; for these specs the solution
    // lies on the crossed circuit, and driving the open circuit misses every target.
    const theta2 = [40, 90, 160].map(toRad) as [number, number, number];
    const theta4 = [50, 80, 110].map(toRad) as [number, number, number];
    const res = synthesizeFunctionGenerator({ theta2, theta4, ground: 4 });
    expect(res.link!.circuit).toBe("crossed");

    const wrongCircuit = { ...res.link!, circuit: "open" as const };
    const missed = theta2.some((t2, i) => {
      const pos = solvePosition(wrongCircuit, t2 + res.inputOffset);
      return !pos || !sameDirection(pos.theta4, theta4[i] + res.outputOffset, 1e-3);
    });
    expect(missed).toBe(true);
  });

  it("states the 180° datum rotation in its notes when a ratio comes out negative", () => {
    const res = synthesizeFunctionGenerator({
      theta2: [40, 90, 160].map(toRad) as [number, number, number],
      theta4: [50, 80, 110].map(toRad) as [number, number, number],
      ground: 4,
    });
    expect(res.inputOffset).toBeCloseTo(Math.PI, 12);
    expect(res.outputOffset).toBeCloseTo(Math.PI, 12);
    expect(res.notes).toMatch(/180/);
    expect(res.notes).toMatch(/crossed/);
  });

  it("still refuses genuinely impossible specifications", () => {
    // Singular system: three identical input angles give a rank-deficient matrix.
    const singular = synthesizeFunctionGenerator({
      theta2: [toRad(10), toRad(10), toRad(10)],
      theta4: [toRad(20), toRad(40), toRad(60)],
    });
    expect(singular.feasible).toBe(false);
    expect(singular.link).toBeNull();

    // Recoverable lengths, but the linkage cannot be assembled at all three points.
    const unreachable = synthesizeFunctionGenerator({
      theta2: [40, 110, 180].map(toRad) as [number, number, number],
      theta4: [100, 140, 180].map(toRad) as [number, number, number],
      ground: 4,
    });
    expect(unreachable.feasible).toBe(false);
    expect(unreachable.link).toBeNull();
    expect(unreachable.notes).toMatch(/circuit/);
  });
});

/**
 * An independent Freudenstein solver, used only to audit the production one's verdicts.
 *
 * Deliberately written from the equations rather than shared with src/engine/synthesis.ts: a 3x3
 * Cramer solve for K1..K3, the ratio-to-length inversion, and the 180° datum flip for negative
 * ratios. Assemblability is then judged by circle-circle intersection (independent.ts), so no part
 * of this path touches the code whose refusals it is checking.
 *
 * Returns null when the spec is genuinely unserviceable, with the reason.
 */
function synthesizeIndependently(
  theta2: [number, number, number],
  theta4: [number, number, number],
  d: number,
): { link: { ground: number; input: number; coupler: number; output: number }; inputOffset: number; outputOffset: number } | { reason: "singular" | "non-assemblable" } {
  // Rows: [cos θ₄, −cos θ₂, 1] · [K1, K2, K3]ᵀ = cos(θ₂ − θ₄)
  const M = [0, 1, 2].map((i) => [Math.cos(theta4[i]), -Math.cos(theta2[i]), 1]);
  const rhs = [0, 1, 2].map((i) => Math.cos(theta2[i] - theta4[i]));

  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const D = det3(M);
  // Scale-aware: the matrix entries are cosines, so O(1). A tiny determinant is rank deficiency.
  if (Math.abs(D) < 1e-10) return { reason: "singular" };

  const sub = (col: number) => M.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)));
  const [K1, K2, K3] = [0, 1, 2].map((c) => det3(sub(c)) / D);
  if (![K1, K2, K3].every(Number.isFinite) || K1 === 0 || K2 === 0) return { reason: "singular" };

  // K1 = d/a and K2 = d/c. A negative ratio means the link points opposite the assumed datum:
  // the length is |a| and the angle is measured from θ₂ + 180°.
  //
  // The signs must be kept until b is found. K3 = (a² − b² + c² + d²) / (2ac) is an identity in
  // SIGNED a and c, so inverting it for b² requires the signed product: taking absolute values
  // first flips the sign of the −2acK3 term whenever exactly one link is reversed, and yields a
  // different (wrong) coupler. That mistake is why this helper first disagreed with the engine on
  // seven of the 81 specs — all seven had exactly one flip.
  const aSigned = d / K1;
  const cSigned = d / K2;
  const bSq = aSigned * aSigned + cSigned * cSigned + d * d - 2 * aSigned * cSigned * K3;
  if (!(bSq > 0)) return { reason: "non-assemblable" };
  const inputOffset = aSigned < 0 ? Math.PI : 0;
  const outputOffset = cSigned < 0 ? Math.PI : 0;
  const link = { ground: d, input: Math.abs(aSigned), coupler: Math.sqrt(bSq), output: Math.abs(cSigned) };

  // Must reach every precision point on ONE shared circuit — the same requirement the production
  // solver applies, tested here by pure geometry.
  const reaches = ([0, 1] as const).some((rootIdx) =>
    [0, 1, 2].every((i) => {
      const roots = assembliesByIntersection({ ...link, couplerPointDist: 0, couplerPointAngle: 0, circuit: "open" }, theta2[i] + inputOffset);
      return roots ? sameDirection(roots[rootIdx].theta4, theta4[i] + outputOffset, 1e-6) : false;
    }),
  );
  if (!reaches) return { reason: "non-assemblable" };
  return { link, inputOffset, outputOffset };
}

describe("Freudenstein function generation — coverage over a grid of ordinary specifications", () => {
  /**
   * How much of the design space the solver serves, and whether its refusals are honest —
   * measured over a population instead of asserted from chosen examples.
   *
   * The four specs above show the negative-ratio fix works. They cannot show how much it changed,
   * nor whether what is still refused deserves to be. This sweeps 81 specifications built from
   * round angles a designer would plausibly ask for and audits EVERY verdict against
   * `synthesizeIndependently` above — a separate implementation whose assemblability test is
   * circle-circle intersection. Agreement on all 81 is the result; the acceptance count itself is
   * a property of the grid, not of the solver, so it is logged rather than asserted tightly.
   *
   * The "before" figure is reconstructed, not remembered: the old guard refused exactly when a
   * Freudenstein ratio came out negative, and that condition is exactly what the corrected solver
   * reports as a 180° datum offset. The old code is gone, so this is the closest honest
   * reconstruction — and the reason the figure is derived here rather than quoted from a notebook.
   */
  const THETA2_TRIPLES: number[][] = [];
  for (const start of [20, 40, 60]) {
    for (const [m, n] of [
      [50, 50],
      [40, 70],
      [70, 40],
    ]) {
      THETA2_TRIPLES.push([start, start + m, start + m + n]);
    }
  }
  const THETA4_TRIPLES: number[][] = [];
  for (const start of [30, 60, 90]) {
    for (const [p, q] of [
      [30, 30],
      [25, 45],
      [45, 25],
    ]) {
      THETA4_TRIPLES.push([start, start + p, start + p + q]);
    }
  }

  it("agrees with an independent solver on every verdict, and threads every solution it accepts", () => {
    let solved = 0;
    let flipped = 0; // solved only because of the datum-flip fix — the old guard's false refusals
    let singular = 0;
    let nonAssemblable = 0;
    let worstResidual = 0;
    let worstEngineErr = 0;
    let worstLengthDiff = 0;
    const disagreements: string[] = [];

    for (const t2Deg of THETA2_TRIPLES) {
      for (const t4Deg of THETA4_TRIPLES) {
        const spec = `${t2Deg.join("/")}° → ${t4Deg.join("/")}°`;
        const theta2 = t2Deg.map(toRad) as [number, number, number];
        const theta4 = t4Deg.map(toRad) as [number, number, number];

        const res = synthesizeFunctionGenerator({ theta2, theta4, ground: 4 });
        const ref = synthesizeIndependently(theta2, theta4, 4);
        const refSolved = !("reason" in ref);

        // THE assertion: the two implementations reach the same verdict. A false refusal shows up
        // here as "production refused, independent solved" — which is exactly how the original
        // defect would have been caught.
        if (res.feasible !== refSolved) {
          disagreements.push(
            `${spec}: production ${res.feasible ? "solved" : `refused (${res.notes.slice(0, 60)})`}, ` +
              `independent ${refSolved ? "solved" : `refused (${(ref as { reason: string }).reason})`}`,
          );
          continue;
        }

        if (!res.feasible) {
          // A refusal must say why. "Infeasible" with no reason is what sent users guessing.
          expect(res.notes.length, `silent refusal for ${spec}`).toBeGreaterThan(0);
          if (/singular|degenerate/i.test(res.notes)) singular++;
          else nonAssemblable++;
          continue;
        }

        solved++;
        const link = res.link!;
        if (res.inputOffset !== 0 || res.outputOffset !== 0) flipped++;

        for (const L of [link.input, link.coupler, link.output]) {
          expect(L, `non-physical length for ${spec}`).toBeGreaterThan(0);
        }
        // Same lengths, not merely a same-verdict coincidence.
        const r = (ref as { link: { input: number; coupler: number; output: number } }).link;
        worstLengthDiff = Math.max(
          worstLengthDiff,
          Math.abs(link.input - r.input),
          Math.abs(link.coupler - r.coupler),
          Math.abs(link.output - r.output),
        );

        // Acceptance without accuracy would be a worse failure than the refusals this fix removed.
        for (let i = 0; i < 3; i++) {
          const wantT2 = theta2[i] + res.inputOffset;
          const wantT4 = theta4[i] + res.outputOffset;
          worstResidual = Math.max(worstResidual, Math.abs(freudensteinResidual(link, wantT2, wantT4)));
          const pos = solvePosition(link, wantT2);
          expect(pos, `accepted but not assemblable: ${spec}`).not.toBeNull();
          let dd = Math.abs(((pos!.theta4 - wantT4) * 180) / Math.PI) % 360;
          if (dd > 180) dd = 360 - dd;
          worstEngineErr = Math.max(worstEngineErr, dd);
        }
      }
    }

    const total = THETA2_TRIPLES.length * THETA4_TRIPLES.length;
    console.log(`\nSynthesis coverage over ${total} prescribed specifications (d = 4)`);
    console.log(`  Verdict disagreements vs independent solver : ${disagreements.length}`);
    for (const d of disagreements) console.log(`    ${d}`);
    console.log(`  Solved                        : ${solved} of ${total}`);
    console.log(`  ...of which need the 180° flip: ${flipped}`);
    console.log(`  Solved under the old guard    : ${solved - flipped} of ${total}   (the flip cases were refused outright)`);
    console.log(`  Refused — singular            : ${singular}`);
    console.log(`  Refused — non-assemblable     : ${nonAssemblable}`);
    console.log(`  Worst |Δlength| vs independent: ${worstLengthDiff.toExponential(2)}`);
    console.log(`  Worst Freudenstein residual   : ${worstResidual.toExponential(2)}`);
    console.log(`  Worst engine Δθ₄              : ${worstEngineErr.toExponential(2)}°`);

    expect(disagreements).toEqual([]);
    // The fix is load-bearing, not cosmetic: it accounts for a large share of what is now solvable.
    expect(flipped).toBeGreaterThan(0.3 * solved);
    expect(worstLengthDiff).toBeLessThan(1e-9);
    expect(worstResidual).toBeLessThan(1e-9);
    expect(worstEngineErr).toBeLessThan(1e-8);
  });
});

describe("Freudenstein function generation — round-trip consistency", () => {
  it("recovers a linkage from its own analysed output (CONSISTENCY, not validation)", () => {
    // This proves the synthesis inverts the analysis — a useful self-consistency property, but
    // NOT validation: the targets come from solvePosition and are checked with solvePosition, so
    // any error shared by both directions cancels. The prescribed-precision-point tests above
    // are the ones that can actually falsify the synthesis. Kept, and labelled honestly.
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
    // Ratios come out positive here, so there is no datum flip to account for.
    expect(res.inputOffset).toBe(0);
    expect(res.outputOffset).toBe(0);
    // Lengths are recovered, not merely something that happens to fit.
    expect(res.link!.input).toBeCloseTo(known.input, 9);
    expect(res.link!.coupler).toBeCloseTo(known.coupler, 9);
    expect(res.link!.output).toBeCloseTo(known.output, 9);

    for (let i = 0; i < 3; i++) {
      const st = analyzeFourBar(res.link!, inputs[i]);
      expect(st.valid).toBe(true);
      expect(Math.cos(st.theta4)).toBeCloseTo(Math.cos(outs[i]), 9);
      expect(Math.sin(st.theta4)).toBeCloseTo(Math.sin(outs[i]), 9);
    }
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
