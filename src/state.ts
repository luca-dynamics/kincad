// Top-level workspace state shape and sensible defaults.

import type { FourBarLinkage, SliderCrankLinkage } from "./engine";
import { toRad } from "./engine";
import type { CadModel } from "./cad/types";
import { DEFAULT_UNIT, type LengthUnit } from "./units";

export type MechanismKind = "fourbar" | "slidercrank";

export interface WorkspaceState {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
  theta2: number; // current input angle (rad)
  omega2: number; // input angular velocity (rad/s)
  playing: boolean;
  speed: number; // animation rate multiplier
  showCouplerCurve: boolean;
  showGrid: boolean;
  /**
   * Draw each link's name at its midpoint in the 2D view (r₁ … r₄ for the four-bar, r₂ / r₃ for the
   * slider-crank), matching the r-notation the Params dock and the report already use. Off by
   * default: it is an on-demand identification aid — turned on so someone who does not know which
   * segment is r₂ can read it off the mechanism — not part of the resting view.
   */
  showLabels: boolean;
  /**
   * The length unit these link dimensions are declared in. A label, not a scale factor: the solver
   * is scale-free and never reads it, so changing it moves nothing — see [units.ts](units.ts).
   */
  unit: LengthUnit;
  /** Last freeform CAD model the agent generated (rendered in the CAD view), if any. */
  cadModel: CadModel | null;
}

// A classic crank-rocker that traces a nice coupler curve.
export const DEFAULT_FOURBAR: FourBarLinkage = {
  ground: 4,
  input: 1.2,
  coupler: 3.5,
  output: 3,
  couplerPointDist: 2.2,
  couplerPointAngle: toRad(35),
  circuit: "open",
};

export const DEFAULT_SLIDER: SliderCrankLinkage = {
  crank: 1.2,
  rod: 4,
  offset: 0.4,
};

/**
 * Default input speed, 1 rev/s. Named because it is not only an initial value: it is the fallback
 * basis for reports rebuilt from data that predates ω₂ being recorded (a conversation saved before
 * the approval card carried a speed), and the server's fallback when a client sends no speed at all.
 * Both need the speed the workspace actually runs at, not the engine's unit-rate 1 rad/s.
 */
export const DEFAULT_OMEGA2 = 2 * Math.PI;

export const INITIAL_STATE: WorkspaceState = {
  kind: "fourbar",
  fourbar: DEFAULT_FOURBAR,
  slider: DEFAULT_SLIDER,
  theta2: 0,
  omega2: DEFAULT_OMEGA2, // 1 rev/s
  playing: true,
  speed: 1,
  showCouplerCurve: true,
  showGrid: true,
  showLabels: false,
  unit: DEFAULT_UNIT,
  cadModel: null,
};
