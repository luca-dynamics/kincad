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
   * Dimension the geometry in place, in whichever view is on screen: each link's name and measured
   * length at its midpoint in 2D and 3D (r₁ … r₄ for the four-bar, r₂ / r₃ for the slider-crank,
   * matching the r-notation the Params dock and the report already use), and the part's X/Y/Z
   * extents on a bounding box in the CAD view. Lengths are shown in `unit` below.
   *
   * ONE FLAG FOR ALL THREE VIEWS, deliberately: it answers one question ("how big is this bit?"), so
   * a user who turns it on in 2D and switches to 3D means it there too. Off by default — it is an
   * on-demand measuring aid, not part of the resting view.
   */
  showLabels: boolean;
  /**
   * The length unit these link dimensions are declared in. A label, not a scale factor: the solver
   * is scale-free and never reads it, so changing it moves nothing — see [units.ts](units.ts).
   * (The CAD view is the one exception, and the only place a conversion happens: a generated part is
   * authored in real millimetres, so its dimensions are converted into this unit before display.)
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
