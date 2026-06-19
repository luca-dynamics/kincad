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
    };
  }
  const [K1, K2, K3] = K;

  // Recover link lengths.
  const a = d / K1; // input
  const c = d / K2; // output
  const b2 = a * a + c * c + d * d - 2 * a * c * K3; // from K3 definition, solved for b^2
  if (!isFinite(a) || !isFinite(c) || b2 <= 0 || a <= 0 || c <= 0) {
    return {
      link: null,
      K: [K1, K2, K3],
      feasible: false,
      notes:
        "Solved coefficients give a non-physical linkage (negative length). Try different precision points or ground length.",
    };
  }
  const b = Math.sqrt(b2);

  const link: FourBarLinkage = {
    ground: d,
    input: Math.abs(a),
    coupler: b,
    output: Math.abs(c),
    couplerPointDist: b / 2,
    couplerPointAngle: 0,
    circuit: "open",
  };

  return {
    link,
    K: [K1, K2, K3],
    feasible: true,
    notes:
      "Function generator synthesised from 3 precision points via Freudenstein's equation. " +
      "Verify by analysis: the output should pass through the three target angles.",
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
