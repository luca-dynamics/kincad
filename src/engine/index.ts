// Public surface of the deterministic kinematics engine.
// Everything the UI and the AI copilot consume goes through here. No numerical result in the
// application originates anywhere else.

export * from "./types";
export * from "./vector";
export {
  classifyGrashof,
  inputFullyRotates,
  solvePosition,
  analyzeFourBar,
  sweepFourBar,
  couplerCurve,
  crankTip,
} from "./fourbar";
export {
  solveSliderPosition,
  analyzeSliderCrank,
  sweepSliderCrank,
  sliderInputFullyRotates,
} from "./slidercrank";
export {
  synthesizeFunctionGenerator,
  synthesizeTwoPosition,
  pivotError,
} from "./synthesis";
export type {
  FunctionGenInput,
  FunctionGenResult,
  TwoPositionInput,
  TwoPositionResult,
} from "./synthesis";
export { buildFourBarReport, buildSliderCrankReport } from "./report";
export type {
  AnalysisReport,
  FourBarReport,
  SliderCrankReport,
  Extremum,
} from "./report";
