// Independent re-derivation of four-bar kinematics, for VALIDATION ONLY.
//
// Nothing in this file shares code with the solver it is used to check:
//
//   * position comes from circle-circle intersection — pure geometry, no Freudenstein
//     coefficients, no half-angle tangent substitution, no quadratic;
//   * velocity and acceleration come from central differences of that position — no
//     analytical differentiation of the loop equation.
//
// So a test that compares src/engine against these numbers compares two independent methods.
// That is the difference between validation and a self-consistency check: feeding a solver its
// own output back and finding it agrees proves only that it is deterministic.
//
// Deliberately NOT exported from src/engine/index.ts — this is test scaffolding, not product
// code, and must never become the thing being validated.

import type { FourBarLinkage } from "../types";

export interface Assembly {
  theta3: number;
  theta4: number;
  /**
   * Half the chord between the two intersection points. It collapses to zero exactly at a
   * toggle position, where the two circuits meet and dtheta/dtheta2 is unbounded — tests use
   * it to skip samples where a finite difference is meaningless.
   */
  halfChord: number;
}

/**
 * Position by circle-circle intersection.
 *
 * With O2 at the origin and O4 at (d, 0), crank tip A = a·(cos θ₂, sin θ₂). Coupler joint B is
 * b from A and c from O4, so it lies where those two circles cross. The two intersections ARE
 * the two assembly circuits. Returns them in a fixed order (−, +) relative to the A→O4
 * direction, which is continuous in θ₂ away from a toggle; null when the circles do not meet.
 */
export function assembliesByIntersection(
  link: FourBarLinkage,
  theta2: number,
): [Assembly, Assembly] | null {
  const { input: a, coupler: b, output: c, ground: d } = link;

  const ax = a * Math.cos(theta2);
  const ay = a * Math.sin(theta2);

  // Vector from A to O4.
  const vx = d - ax;
  const vy = -ay;
  const L = Math.hypot(vx, vy);
  if (L < 1e-12) return null; // A coincident with O4: B is undetermined
  if (L > b + c || L < Math.abs(b - c)) return null; // circles do not meet

  const p = (b * b - c * c + L * L) / (2 * L); // distance A → chord midpoint
  const halfChord = Math.sqrt(Math.max(0, b * b - p * p));

  const ux = vx / L;
  const uy = vy / L;
  // Unit normal to A→O4 (rotate u by +90°).
  const nx = -uy;
  const ny = ux;

  const at = (s: 1 | -1): Assembly => {
    const bx = ax + p * ux + s * halfChord * nx;
    const by = ay + p * uy + s * halfChord * ny;
    return {
      theta3: Math.atan2(by - ay, bx - ax),
      theta4: Math.atan2(by - 0, bx - d),
      halfChord,
    };
  };
  return [at(-1), at(1)];
}

/** Difference x − y folded into (−π, π]. */
export function angleDelta(x: number, y: number): number {
  const TAU = 2 * Math.PI;
  let dv = (x - y) % TAU;
  if (dv > Math.PI) dv -= TAU;
  if (dv <= -Math.PI) dv += TAU;
  return dv;
}

/** True when two angles point the same way, ignoring full turns. */
export function sameDirection(x: number, y: number, tol: number): boolean {
  return Math.abs(angleDelta(x, y)) <= tol;
}

/**
 * Which intersection root (0 or 1) matches a given output angle, or null if neither does.
 *
 * Callers resolve this ONCE at the first valid sample and then hold the index fixed for the
 * whole sweep. Re-matching at every sample would silently paper over a mid-sweep circuit jump
 * — exactly the defect the sweep is meant to catch.
 */
export function matchRoot(
  roots: [Assembly, Assembly],
  theta4: number,
  tol = 1e-6,
): 0 | 1 | null {
  if (sameDirection(roots[0].theta4, theta4, tol)) return 0;
  if (sameDirection(roots[1].theta4, theta4, tol)) return 1;
  return null;
}

/**
 * ω₃, ω₄, α₃, α₄ by central difference of the intersection position, for constant ω₂.
 *
 * dθ/dt = (dθ/dθ₂)·ω₂ and, with α₂ = 0, d²θ/dt² = (d²θ/dθ₂²)·ω₂². Differences are taken with
 * angleDelta so a sample sitting on the ±π seam does not produce a 2π spike.
 */
export function motionByFiniteDifference(
  link: FourBarLinkage,
  theta2: number,
  root: 0 | 1,
  omega2: number,
  h = 1e-4,
): { omega3: number; omega4: number; alpha3: number; alpha4: number } | null {
  const at = (t: number) => assembliesByIntersection(link, t)?.[root] ?? null;
  const mid = at(theta2);
  const fwd = at(theta2 + h);
  const bwd = at(theta2 - h);
  if (!mid || !fwd || !bwd) return null;

  const first = (f: number, b: number) => angleDelta(f, b) / (2 * h);
  const second = (f: number, m: number, b: number) =>
    (angleDelta(f, m) + angleDelta(b, m)) / (h * h);

  return {
    omega3: first(fwd.theta3, bwd.theta3) * omega2,
    omega4: first(fwd.theta4, bwd.theta4) * omega2,
    alpha3: second(fwd.theta3, mid.theta3, bwd.theta3) * omega2 * omega2,
    alpha4: second(fwd.theta4, mid.theta4, bwd.theta4) * omega2 * omega2,
  };
}
