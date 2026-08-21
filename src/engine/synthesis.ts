// Deterministic kinematic SYNTHESIS for four-bar linkages.
// Two classic, closed-form (no iteration, no AI) methods are provided:
//
//   1. Function generation via Freudenstein's equation — given three pairs of input/output
//      angles (theta2_i -> theta4_i), solve a 3x3 linear system for the link ratios.
//      Reference: Norton, "Design of Machinery", Ch. 5 (Freudenstein's equation).
//
//   2. Two/three-position rigid-body (motion) synthesis of the coupler is large; here we
//      implement the most defensible textbook case used in FYP demos: two-position
//      synthesis by the perpendicular-bisector construction (graphical method, computed
//      analytically). Reference: Norton Ch. 3.
//
// All outputs feed straight back into the analysis solver so a synthesised linkage can be
// animated and checked immediately.

import { solvePosition } from "./fourbar";
import type { FourBarLinkage, Vec2 } from "./types";
import { dist, sub } from "./vector";

export interface FunctionGenInput {
  /** Three input crank angles (rad). */
  theta2: [number, number, number];
  /** Three desired output rocker angles (rad). */
  theta4: [number, number, number];
  /** Ground length to scale the result to (link ratios are dimensionless). */
  ground?: number;
}

export interface FunctionGenResult {
  link: FourBarLinkage | null;
  /** Freudenstein coefficients K1, K2, K3. */
  K: [number, number, number];
  feasible: boolean;
  notes: string;
  /**
   * Datum rotation (rad, 0 or π) to ADD to the prescribed angles before the synthesised
   * linkage reproduces them.
   *
   * Freudenstein gives K1 = d/a and K2 = d/c, so a negative K means that link is directed
   * OPPOSITE to the assumed datum — length |a|, angle measured from θ₂ + 180°. A physical link
   * cannot have negative length, so the sign is carried here rather than dropped: this used to
   * be `Math.abs(a)` with nothing recorded, which handed back a linkage that missed every
   * precision point (θ₄ = 74.49° where 50° was asked for) while reporting success.
   */
  inputOffset: number;
  outputOffset: number;
}

/** True when two angles are the same direction, ignoring full turns. */
function sameAngle(x: number, y: number, tol = 1e-7): boolean {
  const TAU = 2 * Math.PI;
  let d = Math.abs(x - y) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d < tol;
}

/**
 * Solve Freudenstein's equation for three precision points.
 *
 * Freudenstein: K1 cos(theta4) - K2 cos(theta2) + K3 = cos(theta2 - theta4),  with
 *   K1 = d/a,  K2 = d/c,  K3 = (a^2 - b^2 + c^2 + d^2) / (2 a c).
 * Three (theta2, theta4) pairs give a 3x3 linear system in K1, K2, K3. From K1, K2 we get
 * a = d/K1, c = d/K2; then b from K3. Ground length d is chosen freely (scale).
 */
export function synthesizeFunctionGenerator(
  input: FunctionGenInput,
): FunctionGenResult {
  const d = input.ground ?? 1;
  const [p2a, p2b, p2c] = input.theta2;
  const [p4a, p4b, p4c] = input.theta4;

  // Rows: [cos(theta4_i), -cos(theta2_i), 1] · [K1,K2,K3]^T = cos(theta2_i - theta4_i)
  const M: number[][] = [
    [Math.cos(p4a), -Math.cos(p2a), 1],
    [Math.cos(p4b), -Math.cos(p2b), 1],
    [Math.cos(p4c), -Math.cos(p2c), 1],
  ];
  const rhs = [
    Math.cos(p2a - p4a),
    Math.cos(p2b - p4b),
    Math.cos(p2c - p4c),
  ];

  const K = solve3x3(M, rhs);
  if (!K) {
    return {
      link: null,
      K: [NaN, NaN, NaN],
      feasible: false,
      notes: "Precision points are singular (degenerate system); choose different angles.",
      inputOffset: 0,
      outputOffset: 0,
    };
  }
  const [K1, K2, K3] = K;

  // Recover link lengths.
  const a = d / K1; // input
  const c = d / K2; // output
  const b2 = a * a + c * c + d * d - 2 * a * c * K3; // from K3 definition, solved for b^2
  if (!isFinite(a) || !isFinite(c) || !isFinite(b2) || b2 <= 0) {
    return {
      link: null,
      K: [K1, K2, K3],
      feasible: false,
      notes:
        "Solved coefficients give no real coupler length (b² ≤ 0). Try different precision " +
        "points or ground length.",
      inputOffset: 0,
      outputOffset: 0,
    };
  }
  const b = Math.sqrt(b2);

  // A negative ratio does NOT mean the design is impossible. K1 = d/a and K2 = d/c, so K1 < 0
  // means the input link is directed OPPOSITE to the assumed datum: length |a|, measured from
  // theta2 + 180 deg. The linkage is perfectly buildable; only the datum moves. Rejecting these
  // outright (the old `a <= 0 || c <= 0` guard) refused most ordinary specs as "non-physical",
  // and taking Math.abs() without recording the flip silently moved the datum instead.
  const inputOffset = a < 0 ? Math.PI : 0;
  const outputOffset = c < 0 ? Math.PI : 0;

  const base = {
    ground: d,
    input: Math.abs(a),
    coupler: b,
    output: Math.abs(c),
    couplerPointDist: b / 2,
    couplerPointAngle: 0,
  };

  // Both roots of the position quadratic (Norton Eq. 4.10) satisfy Freudenstein's equation, so
  // the circuit that actually threads the precision points must be TESTED, not assumed. It was
  // hardcoded "open"; for many valid solutions the crossed branch is the one that fits.
  let link: FourBarLinkage | null = null;
  for (const circuit of ["open", "crossed"] as const) {
    const candidate: FourBarLinkage = { ...base, circuit };
    const threadsAll = input.theta2.every((t2, i) => {
      const pos = solvePosition(candidate, t2 + inputOffset);
      return !!pos && sameAngle(pos.theta4, input.theta4[i] + outputOffset, 1e-6);
    });
    if (threadsAll) {
      link = candidate;
      break;
    }
  }

  if (!link) {
    return {
      link: null,
      K: [K1, K2, K3],
      feasible: false,
      notes:
        "Link lengths were recovered, but neither assembly circuit reaches all three precision " +
        "points (the linkage cannot be assembled at one of them). Try different precision " +
        "points or ground length.",
      inputOffset,
      outputOffset,
    };
  }

  const flips: string[] = [];
  if (inputOffset !== 0) flips.push("input crank");
  if (outputOffset !== 0) flips.push("output rocker");
  const offsetNote = flips.length
    ? ` The ${flips.join(" and ")} ${flips.length > 1 ? "datums are" : "datum is"} rotated 180°, ` +
      "so the prescribed correspondence occurs at θ₂ + 180° (a negative Freudenstein ratio means " +
      "the link points the other way; its length is positive)."
    : "";

  return {
    link,
    K: [K1, K2, K3],
    feasible: true,
    notes:
      "Function generator synthesised from 3 precision points via Freudenstein's equation, on " +
      `the ${link.circuit} circuit — verified by analysis to pass through all three target ` +
      `angles to within 1e-6 rad.${offsetNote}`,
    inputOffset,
    outputOffset,
  };
}

export interface TwoPositionInput {
  /** Two locations of the moving pivot's start point (e.g. coupler joint A). */
  pointStart: Vec2;
  pointEnd: Vec2;
  /** Two locations of a second coupler point (e.g. joint B). */
  point2Start: Vec2;
  point2End: Vec2;
}

export interface TwoPositionResult {
  /** Fixed pivot for the first moving point (centre of its perpendicular bisector). */
  fixedPivotA: Vec2;
  fixedPivotB: Vec2;
  notes: string;
}

/**
 * Two-position motion synthesis: the fixed pivot for a moving point lies anywhere on the
 * perpendicular bisector of the segment joining its two positions. We return the bisector
 * midpoints as a concrete pivot choice (the simplest defensible selection); a designer can
 * slide the pivot along the bisector. Reference: Norton Ch. 3 (graphical synthesis).
 */
export function synthesizeTwoPosition(
  input: TwoPositionInput,
): TwoPositionResult {
  const mAB = midpoint(input.pointStart, input.pointEnd);
  const mCD = midpoint(input.point2Start, input.point2End);
  return {
    fixedPivotA: mAB,
    fixedPivotB: mCD,
    notes:
      "Two-position synthesis: each fixed pivot may lie anywhere on the perpendicular " +
      "bisector of its moving point's two positions. Midpoints returned as a starting choice.",
  };
}

// ---- small linear-algebra helpers (kept local so the engine has no dependencies) ----

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Solve a 3x3 system M x = r by Cramer's rule. Returns null if det ~ 0. */
function solve3x3(M: number[][], r: number[]): [number, number, number] | null {
  const det = det3(M);
  if (Math.abs(det) < 1e-12) return null;
  const Mx = [
    [r[0], M[0][1], M[0][2]],
    [r[1], M[1][1], M[1][2]],
    [r[2], M[2][1], M[2][2]],
  ];
  const My = [
    [M[0][0], r[0], M[0][2]],
    [M[1][0], r[1], M[1][2]],
    [M[2][0], r[2], M[2][2]],
  ];
  const Mz = [
    [M[0][0], M[0][1], r[0]],
    [M[1][0], M[1][1], r[1]],
    [M[2][0], M[2][1], r[2]],
  ];
  return [det3(Mx) / det, det3(My) / det, det3(Mz) / det];
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Distance a synthesised pivot lies from a target point — handy for reporting error. */
export function pivotError(pivot: Vec2, target: Vec2): number {
  return dist(pivot, target);
}

export { sub as _sub };
