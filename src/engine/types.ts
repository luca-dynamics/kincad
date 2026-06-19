// Shared types for the kinematics engine.
// All angles are in RADIANS internally. Lengths are unitless (treat as mm by convention).
// The engine is fully deterministic — no AI, no randomness. This is the single source of
// truth for every number the application reports.

export interface Vec2 {
  x: number;
  y: number;
}

/** Circuit (assembly) selection for a four-bar linkage. */
export type Circuit = "open" | "crossed";

/** Grashof classification of a four-bar linkage. */
export type GrashofType =
  | "crank-rocker"
  | "double-crank" // drag-link
  | "double-rocker"
  | "change-point" // s + l == p + q (e.g. parallelogram)
  | "triple-rocker"; // non-Grashof, all links oscillate

export interface GrashofResult {
  isGrashof: boolean;
  type: GrashofType;
  shortest: "ground" | "input" | "coupler" | "output";
  /** s + l */
  sumShortLong: number;
  /** p + q */
  sumOthers: number;
  summary: string;
}

/** Geometric definition of a four-bar linkage. */
export interface FourBarLinkage {
  /** r1 — ground link length (distance O2->O4). */
  ground: number;
  /** r2 — input crank length (driven). */
  input: number;
  /** r3 — coupler length. */
  coupler: number;
  /** r4 — output rocker length. */
  output: number;
  /** Distance of the coupler point P from joint A, along/relative to the coupler line AB. */
  couplerPointDist: number;
  /** Angle (rad) of P relative to the coupler line AB (line A->B is the reference). */
  couplerPointAngle: number;
  /** Assembly circuit. */
  circuit: Circuit;
}

/** Full kinematic state of a four-bar at one input angle. */
export interface FourBarState {
  theta2: number; // input angle (rad)
  theta3: number; // coupler angle (rad)
  theta4: number; // output angle (rad)
  omega2: number; // input angular velocity (rad/s)
  omega3: number;
  omega4: number;
  alpha2: number; // input angular acceleration (rad/s^2)
  alpha3: number;
  alpha4: number;
  // Joint locations in the global frame.
  O2: Vec2; // fixed input pivot (origin)
  O4: Vec2; // fixed output pivot (ground, +x)
  A: Vec2; // crank tip / coupler start (moving)
  B: Vec2; // rocker tip / coupler end (moving)
  P: Vec2; // coupler point (traces the coupler curve)
  transmissionAngle: number; // deg, reported acute (0..90 ideal near 90)
  mechanicalAdvantage: number; // |omega2/omega4| * (output torque ratio); see notes
  /** True when the requested input angle is reachable in this circuit (linkage assembles). */
  valid: boolean;
}

/** Geometric definition of a slider-crank mechanism. */
export interface SliderCrankLinkage {
  /** r2 — crank length. */
  crank: number;
  /** r3 — connecting rod length. */
  rod: number;
  /** Perpendicular offset of the slider line from the crank pivot O2 (0 = in-line). */
  offset: number;
}

export interface SliderCrankState {
  theta2: number; // crank angle (rad)
  theta3: number; // rod angle (rad), measured from +x
  omega2: number;
  omega3: number;
  alpha2: number;
  alpha3: number;
  sliderPos: number; // x position of slider pin
  sliderVel: number;
  sliderAcc: number;
  O2: Vec2;
  A: Vec2; // crank tip / rod start
  B: Vec2; // slider pin
  transmissionAngle: number; // deg
  valid: boolean;
}
