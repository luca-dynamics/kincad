// Top-level workspace state shape and sensible defaults.

import type { FourBarLinkage, SliderCrankLinkage } from "./engine";
import { toRad } from "./engine";
import type { CadModel } from "./cad/types";

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

export const INITIAL_STATE: WorkspaceState = {
  kind: "fourbar",
  fourbar: DEFAULT_FOURBAR,
  slider: DEFAULT_SLIDER,
  theta2: 0,
  omega2: 2 * Math.PI, // 1 rev/s
  playing: true,
  speed: 1,
  showCouplerCurve: true,
  showGrid: true,
  cadModel: null,
};
