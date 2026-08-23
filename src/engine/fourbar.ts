// Deterministic four-bar linkage solver.
// Method: vector-loop (Freudenstein) closed-form position analysis, followed by the
// analytical velocity and acceleration equations obtained by differentiating the loop.
// References: R. L. Norton, "Design of Machinery", 5th ed., Ch. 4 (position), Ch. 6
// (velocity), Ch. 7 (acceleration). Equation numbers are noted inline.
//
// Link labelling (Norton convention):
//   a = r2 = input crank   b = r3 = coupler   c = r4 = output rocker   d = r1 = ground
// Frame: O2 at the origin, O4 at (d, 0); ground link lies along +x (theta1 = 0).

import type {
  FourBarLinkage,
  FourBarState,
  GrashofResult,
  GrashofType,
} from "./types";
import { fromPolar, polar, toDeg, v, wrap2Pi } from "./vector";

/**
 * Grashof condition: a four-bar has at least one fully rotating link iff s + l <= p + q,
 * where s, l are the shortest and longest links and p, q the other two.
 */
export function classifyGrashof(link: FourBarLinkage): GrashofResult {
  const links = [
    { name: "ground" as const, L: link.ground },
    { name: "input" as const, L: link.input },
    { name: "coupler" as const, L: link.coupler },
    { name: "output" as const, L: link.output },
  ];
  const sorted = [...links].sort((m, n) => m.L - n.L);
  const s = sorted[0];
  const l = sorted[3];
  const sumShortLong = s.L + l.L;
  const sumOthers = sorted[1].L + sorted[2].L;

  let type: GrashofType;
  let isGrashof: boolean;

  const EPS = 1e-9;
  if (Math.abs(sumShortLong - sumOthers) < EPS) {
    type = "change-point";
    isGrashof = true; // change-point linkages can rotate but pass through singular states
  } else if (sumShortLong < sumOthers) {
    isGrashof = true;
    // Classification depends on which link is the shortest.
    switch (s.name) {
      case "ground":
        type = "double-crank";
        break;
      case "coupler":
        type = "double-rocker";
        break;
      default: // shortest is input or output (a side link)
        type = "crank-rocker";
    }
  } else {
    isGrashof = false;
    type = "triple-rocker";
  }

  const labels: Record<GrashofType, string> = {
    "crank-rocker": "Grashof crank-rocker: input crank fully rotates, output rocks.",
    "double-crank": "Grashof double-crank (drag-link): both input and output fully rotate.",
    "double-rocker": "Grashof double-rocker: coupler rotates; input and output oscillate.",
    "change-point": "Change-point: s+l = p+q; passes through a collinear singular position.",
    "triple-rocker": "Non-Grashof triple-rocker: no link makes a full revolution.",
  };

  return {
    isGrashof,
    type,
    shortest: s.name,
    sumShortLong,
    sumOthers,
    summary: labels[type],
  };
}

/** True if the input crank can complete a full 360° rotation for this geometry. */
export function inputFullyRotates(link: FourBarLinkage): boolean {
  const g = classifyGrashof(link);
  if (g.type === "double-crank") return true;
  if (g.type === "crank-rocker") return g.shortest === "input";
  if (g.type === "change-point") return true;
  return false;
}

/**
 * Closed-form position analysis. Returns coupler angle theta3 and output angle theta4 for
 * a given input angle theta2, or null if the linkage cannot assemble at that angle in the
 * requested circuit (the discriminant goes negative).
 */
export function solvePosition(
  link: FourBarLinkage,
  theta2: number,
): { theta3: number; theta4: number } | null {
  const a = link.input;
  const b = link.coupler;
  const c = link.output;
  const d = link.ground;
  const sign = link.circuit === "open" ? -1 : 1; // ∓ in Norton 4.10/4.13

  const cos2 = Math.cos(theta2);
  const sin2 = Math.sin(theta2);

  // --- theta4 (output), Norton Eq. 4.10 ---
  const K1 = d / a;
  const K2 = d / c;
  const K3 = (a * a - b * b + c * c + d * d) / (2 * a * c);
  const A = cos2 - K1 - K2 * cos2 + K3;
  const B = -2 * sin2;
  const C = K1 - (K2 + 1) * cos2 + K3;
  const discT4 = B * B - 4 * A * C;
  if (discT4 < 0) return null; // linkage cannot be assembled here
  const theta4 = 2 * Math.atan2(-B + sign * Math.sqrt(discT4), 2 * A);

  // --- theta3 (coupler), Norton Eq. 4.13 ---
  const K4 = d / b;
  const K5 = (c * c - d * d - a * a - b * b) / (2 * a * b);
  const D = cos2 - K1 + K4 * cos2 + K5;
  const E = -2 * sin2;
  const F = K1 + (K4 - 1) * cos2 + K5;
  const discT3 = E * E - 4 * D * F;
  if (discT3 < 0) return null;
  const theta3 = 2 * Math.atan2(-E + sign * Math.sqrt(discT3), 2 * D);

  return { theta3, theta4 };
}

/**
 * Full kinematic analysis at one input angle. omega2 (rad/s) and alpha2 (rad/s^2) are the
 * input motion; pass omega2 = 1, alpha2 = 0 for a unit-rate kinematic study.
 */
export function analyzeFourBar(
  link: FourBarLinkage,
  theta2: number,
  omega2 = 1,
  alpha2 = 0,
): FourBarState {
  const a = link.input;
  const b = link.coupler;
  const c = link.output;
  const d = link.ground;

  const O2 = v(0, 0);
  const O4 = v(d, 0);

  const pos = solvePosition(link, theta2);
  if (!pos) {
    // Non-assemblable: return a flagged, geometrically inert state.
    const A = fromPolar(O2, a, theta2);
    return {
      theta2,
      theta3: NaN,
      theta4: NaN,
      omega2,
      omega3: NaN,
      omega4: NaN,
      alpha2,
      alpha3: NaN,
      alpha4: NaN,
      O2,
      O4,
      A,
      B: A,
      P: A,
      transmissionAngle: NaN,
      mechanicalAdvantage: NaN,
      valid: false,
    };
  }
  const { theta3, theta4 } = pos;

  // --- Velocity, Norton Eq. 6.18 ---
  const s23 = Math.sin(theta2 - theta3);
  const s43 = Math.sin(theta4 - theta3);
  const s34 = Math.sin(theta3 - theta4);
  const omega3 = (a * omega2 * Math.sin(theta4 - theta2)) / (b * s34);
  const omega4 = (a * omega2 * s23) / (c * s43);

  // --- Acceleration, Norton Eq. 7.12 ---
  const c2 = Math.cos(theta2);
  const s2 = Math.sin(theta2);
  const c3 = Math.cos(theta3);
  const s3 = Math.sin(theta3);
  const c4 = Math.cos(theta4);
  const s4 = Math.sin(theta4);
  const AA = c * s4;
  const BB = b * s3;
  const CC =
    a * alpha2 * s2 +
    a * omega2 * omega2 * c2 +
    b * omega3 * omega3 * c3 -
    c * omega4 * omega4 * c4;
  const DD = c * c4;
  const EE = b * c3;
  const FF =
    a * alpha2 * c2 -
    a * omega2 * omega2 * s2 -
    b * omega3 * omega3 * s3 +
    c * omega4 * omega4 * s4;
  const denom = AA * EE - BB * DD;
  const alpha3 = (CC * DD - AA * FF) / denom;
  const alpha4 = (CC * EE - BB * FF) / denom;

  // --- Joint locations ---
  const A = fromPolar(O2, a, theta2);
  const B = fromPolar(O4, c, theta4);
  // Coupler point P: offset from A, relative to the coupler line (angle theta3).
  const P = fromPolar(A, link.couplerPointDist, theta3 + link.couplerPointAngle);

  // --- Transmission angle: angle between coupler (3) and output (4), reported acute. ---
  let mu = Math.abs(toDeg(theta4 - theta3)) % 360;
  if (mu > 180) mu = 360 - mu;
  if (mu > 90) mu = 180 - mu;

  // --- Mechanical advantage (Norton Eq. 6.13c): MA = (output torque)/(input torque) for a
  // conservative linkage = |omega2 / omega4|. Infinite at toggle (omega4 -> 0). ---
  const mechanicalAdvantage = Math.abs(omega2 / omega4);

  return {
    theta2,
    theta3,
    theta4,
    omega2,
    omega3,
    omega4,
    alpha2,
    alpha3,
    alpha4,
    O2,
    O4,
    A,
    B,
    P,
    transmissionAngle: mu,
    mechanicalAdvantage,
    valid: true,
  };
}

/**
 * Sweep the input crank over a full cycle (or the reachable arc, for a rocker input) and
 * return a series of states. `steps` controls resolution. Non-assemblable samples are
 * skipped so plots/animation only show physically real positions.
 */
export function sweepFourBar(
  link: FourBarLinkage,
  steps = 360,
  omega2 = 1,
  alpha2 = 0,
): FourBarState[] {
  const states: FourBarState[] = [];
  for (let i = 0; i < steps; i++) {
    const theta2 = (2 * Math.PI * i) / steps;
    const st = analyzeFourBar(link, theta2, omega2, alpha2);
    if (st.valid) states.push(st);
  }
  return states;
}

/** Trace just the coupler curve (point P) over a full cycle. */
export function couplerCurve(link: FourBarLinkage, steps = 360) {
  return sweepFourBar(link, steps).map((s) => s.P);
}

/** Convenience: the global location of coupler joint A for a bare crank angle. */
export function crankTip(link: FourBarLinkage, theta2: number) {
  return polar(link.input, wrap2Pi(theta2));
}
