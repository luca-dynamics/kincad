// How a whole-cycle ANALYSIS REPORT is presented to a human, and how two of them differ.
//
// Sibling of params.ts: that module presents one parameter, this one presents one report. Neither
// computes kinematics. Every number below is read straight out of `buildFourBarReport` /
// `buildSliderCrankReport` — this file only formats and subtracts.
//
// The single judgement made here is whether the minimum transmission angle crossed
// `transmission.poorBelowDeg`, which is a threshold the *report itself* publishes. There are
// deliberately no scores, grades, or confidence figures: the engine does not produce any, so
// neither does the interface.

import {
  buildFourBarReport,
  buildSliderCrankReport,
  type AnalysisReport,
  type Extremum,
  type FourBarReport,
  type SliderCrankReport,
} from "./engine";
import type { Linkages } from "./ai/apply";
import { perSec, perSec2, type LengthUnit } from "./units";

/**
 * Sweep resolution for reports built here. Matches the parameter dock
 * (components/Panel.tsx) so the same geometry never yields two slightly different extrema.
 */
export const REPORT_STEPS = 360;

export interface Metric {
  /** Stable identity — the React key, and how `compareMetrics` pairs before with after. */
  key: string;
  label: string;
  /** Formatted, engine-derived. `"—"` when the solver could not produce a value. */
  value: string;
  /** Set only by `compareMetrics`, and only when the value actually moved. */
  from?: string;
  /** Secondary note, e.g. where in the cycle an extremum occurs. */
  detail?: string;
  /**
   * Direction relative to an engine-published rule — never a general "better". Set only on the
   * minimum transmission angle, and only when it crosses `transmission.poorBelowDeg`.
   */
  trend?: "toward-rule" | "away-from-rule";
}

// ── formatting ───────────────────────────────────────────────────────────────

/** A number for display, or an em dash when the solver could not produce one. */
function num(v: number, decimals: number, unit = ""): string {
  return Number.isFinite(v) ? `${v.toFixed(decimals)}${unit}` : "—";
}

/** Signed span across the cycle, e.g. `"-4.12 … 4.12 rad/s"`. */
function span(lo: number, hi: number, decimals: number, unit = ""): string {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "—";
  return `${lo.toFixed(decimals)} … ${hi.toFixed(decimals)}${unit}`;
}

/** `"at θ₂ = 27°"` — where in the revolution an extremum occurs. */
function at(theta2Deg: number): string | undefined {
  return Number.isFinite(theta2Deg) ? `at θ₂ = ${theta2Deg.toFixed(0)}°` : undefined;
}

/** Whichever end of a range is larger in magnitude — the peak of |v| or |a| over the cycle. */
function peak(e: { min: Extremum; max: Extremum }): Extremum {
  return Math.abs(e.max.value) >= Math.abs(e.min.value) ? e.max : e.min;
}

/**
 * True when the sweep produced at least one sample. `report.ts` seeds its extrema at ±Infinity, so
 * a geometry that never assembles leaves them there — the cycle rows are omitted rather than
 * printed as dashes or, worse, as the seeded zero mean.
 */
function assembled(r: AnalysisReport): boolean {
  return Number.isFinite(r.transmission.min.value);
}

/**
 * The transmission-angle guideline the report publishes, if it publishes one. The four-bar report
 * carries it as `transmission.poorBelowDeg`. The slider-crank report applies the same rule when it
 * writes its warning but does not expose the number, so this returns `undefined` there rather than
 * keeping a second copy of the threshold outside the engine.
 */
function guideline(r: AnalysisReport): number | undefined {
  return r.kind === "fourbar" ? r.transmission.poorBelowDeg : undefined;
}

// ── the rows ─────────────────────────────────────────────────────────────────

/**
 * How far the input link can turn. Covers all three outcomes in one row, so a comparison reads
 * `fully → does not assemble` instead of silently dropping every cycle figure.
 */
function rotationRow(r: AnalysisReport, arcDeg: number | null): Metric {
  const value = arcDeg !== null && arcDeg <= 0
    ? "does not assemble"
    : r.inputFullyRotates ? "fully" : "limited";
  return {
    key: "rotation",
    label: "Input rotation",
    value,
    detail:
      arcDeg !== null && arcDeg > 0 && arcDeg < 359.5
        ? `${arcDeg.toFixed(0)}° of 360° reachable`
        : undefined,
  };
}

function fourBarMetrics(r: FourBarReport, unit: LengthUnit): Metric[] {
  const rows: Metric[] = [
    { key: "grashof", label: "Grashof", value: r.grashof.type },
    rotationRow(r, r.reachableArcDeg),
  ];
  if (!assembled(r)) return rows;
  rows.push(
    { key: "muMin", label: "μ min", value: num(r.transmission.min.value, 1, "°"), detail: at(r.transmission.min.atTheta2Deg) },
    { key: "muMax", label: "μ max", value: num(r.transmission.max.value, 1, "°"), detail: at(r.transmission.max.atTheta2Deg) },
    { key: "muMean", label: "μ mean", value: num(r.transmission.mean, 1, "°") },
    { key: "omega4", label: "ω₄ range", value: span(r.omega4.min.value, r.omega4.max.value, 2, " rad/s") },
    { key: "alpha4", label: "α₄ range", value: span(r.alpha4.min.value, r.alpha4.max.value, 2, " rad/s²") },
    {
      // The unit is stated once, after the height: `3.21 × 1.84 mm` is how a size is written, and
      // repeating it on the width would make the row read like two separate measurements.
      key: "coupler",
      label: "Coupler extent",
      value: `${num(r.couplerExtent.width, 2)} × ${num(r.couplerExtent.height, 2, ` ${unit}`)}`,
    },
  );
  return rows;
}

function sliderMetrics(r: SliderCrankReport, unit: LengthUnit): Metric[] {
  // The slider report carries no reachable-arc figure, so the rotation row falls back to the
  // closed-form `inputFullyRotates` alone.
  const rows: Metric[] = [rotationRow(r, null)];
  if (!assembled(r)) return rows;
  const v = peak(r.sliderVel);
  const a = peak(r.sliderAcc);
  rows.push(
    { key: "stroke", label: "Stroke", value: num(r.stroke, 3, ` ${unit}`) },
    { key: "velMax", label: "|v| max", value: num(Math.abs(v.value), 3, ` ${perSec(unit)}`), detail: at(v.atTheta2Deg) },
    { key: "accMax", label: "|a| max", value: num(Math.abs(a.value), 3, ` ${perSec2(unit)}`), detail: at(a.atTheta2Deg) },
    { key: "muMin", label: "μ min", value: num(r.transmission.min.value, 1, "°"), detail: at(r.transmission.min.atTheta2Deg) },
  );
  return rows;
}

/**
 * Headline cycle figures for one report.
 *
 * `unit` is the workspace's declared length unit ([units.ts](units.ts)) and, like `reportFor`'s
 * `omega2`, has no default: the linear rows here (stroke, |v| max, |a| max, the coupler envelope)
 * are the ones a reader has to take a unit on trust, and a fallback would let a caller print `mm`
 * for a workspace declared in inches without anything going visibly wrong.
 */
export function metrics(r: AnalysisReport, unit: LengthUnit): Metric[] {
  return r.kind === "fourbar" ? fourBarMetrics(r, unit) : sliderMetrics(r, unit);
}

/**
 * The same rows, annotated with `from` where the value moved. Rows that did not move are dropped,
 * so the caller can render "nothing measurable changes" honestly. Rows with no counterpart in
 * `before` — a mechanism switch, or a figure the other kind does not have — are kept without a
 * `from`, since there is nothing to compare them against.
 *
 * One `unit` for both sides, because a comparison is only meaningful on one basis: the unit is a
 * declaration about the workspace, and both reports being compared are of that same workspace.
 */
export function compareMetrics(
  before: AnalysisReport,
  after: AnalysisReport,
  unit: LengthUnit,
): Metric[] {
  const prior = new Map(metrics(before, unit).map((m) => [m.key, m.value]));
  const out: Metric[] = [];
  for (const m of metrics(after, unit)) {
    const was = prior.get(m.key);
    if (was === m.value) continue;
    out.push(was === undefined ? m : { ...m, from: was });
  }

  // Crossing the published guideline is a defined event, so it is the one place a direction is
  // stated. Both values must exist: an unreachable geometry has no minimum to compare.
  const guide = guideline(after);
  const lo = before.transmission.min.value;
  const hi = after.transmission.min.value;
  if (guide !== undefined && Number.isFinite(lo) && Number.isFinite(hi) && lo < guide !== hi < guide) {
    const row = out.find((m) => m.key === "muMin");
    if (row) {
      const poor = hi < guide;
      row.trend = poor ? "away-from-rule" : "toward-rule";
      row.detail = poor ? `now below the ${guide}° guideline` : `back above the ${guide}° guideline`;
    }
  }
  return out;
}

/**
 * Identity of a warning independent of the values inside it. The engine embeds live numbers in its
 * warning text ("drops to 38.2° near θ2 = 27°"), so comparing raw strings would report one warning
 * as both cleared and introduced whenever the geometry moves at all. Stripping the digits leaves
 * the rule that fired.
 */
function warningKey(w: string): string {
  return w.replace(/[\d.]+/g, "#");
}

/** Warning churn between two geometries. `introduced` carries the engine's own text, verbatim. */
export function warningDelta(
  before: AnalysisReport,
  after: AnalysisReport,
): { cleared: number; introduced: string[] } {
  const was = new Set(before.warnings.map(warningKey));
  const now = new Set(after.warnings.map(warningKey));
  let cleared = 0;
  for (const k of was) if (!now.has(k)) cleared++;
  return { cleared, introduced: after.warnings.filter((w) => !was.has(warningKey(w))) };
}

/**
 * The report for a set of linkages — shared by the workspace, the plots, the PDF and the approval
 * card.
 *
 * `omega2` is REQUIRED, and deliberately has no default. The engine's builders default to a
 * unit-rate 1 rad/s sweep, which is a valid analysis but not the one the interface is showing: at
 * the workspace default of 2π rad/s it makes every reported ω₄ a factor of 6.28 too small and every
 * α₄ a factor of 39.5 too small, while μ, Grashof, stroke and the coupler envelope stay correct —
 * so the report looks right and quietly is not. Forcing the argument here is what keeps the PDF, the
 * parameter dock, the plots and the agent's context on the same basis.
 */
export function reportFor(l: Linkages, omega2: number): AnalysisReport {
  return l.kind === "fourbar"
    ? buildFourBarReport(l.fourbar, REPORT_STEPS, omega2)
    : buildSliderCrankReport(l.slider, REPORT_STEPS, omega2);
}
