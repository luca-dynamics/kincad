// How a linkage parameter is presented to a human: its label, its unit, and whether
// the stored value needs converting for display.
//
// This is the ONLY place that knows `couplerPointAngle` is stored in radians but shown
// in degrees. Both the parameter dock (components/Panel.tsx) and the chat's activity
// trace (components/chat/ActivityTrace.tsx) read from here, so a parameter can never be
// labelled one way in the dock and another way in the transcript.

import { toDeg, toRad } from "./engine";
import type { LengthUnit } from "./units";

export interface ParamMeta {
  label: string;
  /**
   * A FIXED unit suffix, appended directly — only for a quantity whose unit never changes, which
   * here means the coupler-point angle. Lengths use `length` instead.
   */
  unit?: string;
  /**
   * True for a LENGTH, whose unit is whatever the workspace declares (see [units.ts](units.ts)).
   * A flag rather than a unit string because that unit is chosen at runtime: writing "mm" in here
   * would put a second, stale copy of the declaration one file away from the live one.
   */
  length?: boolean;
  decimals: number;
  /** Stored value → displayed value. Identity unless the units differ. */
  toDisplay: (v: number) => number;
  /** Displayed value → stored value. Inverse of `toDisplay`. */
  toStored: (v: number) => number;
}

const identity = (v: number) => v;

function meta(label: string, opts: Partial<Omit<ParamMeta, "label">> = {}): ParamMeta {
  return { label, decimals: 2, toDisplay: identity, toStored: identity, ...opts };
}

/** A link dimension: stored unit-free, displayed in the workspace's declared length unit. */
const length = (label: string): ParamMeta => meta(label, { length: true });

export const PARAM_META: Record<string, ParamMeta> = {
  // ── four-bar ──────────────────────────────────────────────────────────────
  ground: length("Ground r₁"),
  input: length("Input r₂"),
  coupler: length("Coupler r₃"),
  output: length("Output r₄"),
  couplerPointDist: length("Cpl pt dist"),
  couplerPointAngle: meta("Cpl pt ∠", { unit: "°", decimals: 0, toDisplay: toDeg, toStored: toRad }),
  circuit: meta("Circuit", { decimals: 0 }),

  // ── slider-crank ──────────────────────────────────────────────────────────
  crank: length("Crank r₂"),
  rod: length("Rod r₃"),
  offset: length("Offset e"),
};

/** Human label for a parameter key, falling back to the raw key for anything unknown. */
export function paramLabel(key: string): string {
  return PARAM_META[key]?.label ?? key;
}

/** Whatever follows the number: `"°"`, `" mm"` — or nothing, when no unit has been declared. */
function suffix(key: string, unit?: LengthUnit): string {
  const m = PARAM_META[key];
  if (!m) return "";
  if (m.unit) return m.unit;
  return m.length && unit ? ` ${unit}` : "";
}

/**
 * Format a *stored* parameter value the way a human reads it — converting units and
 * appending the suffix. `couplerPointAngle` 0.6108 becomes "35°", never raw radians.
 *
 * `unit` is the workspace's declared length unit. It is optional because a length is genuinely
 * unitless until something declares one, and callers with no workspace in scope (a test, a bare
 * label) must not be forced to invent one — but pass it wherever there is one, or the dock and the
 * transcript end up describing the same parameter differently, which is what this module exists to
 * prevent.
 */
export function formatValue(key: string, v: unknown, unit?: LengthUnit): string {
  // Enum-valued params (circuit: "open" | "crossed") display title-cased, matching the dock's toggle.
  if (typeof v === "string") return v.charAt(0).toUpperCase() + v.slice(1);
  if (typeof v !== "number" || !Number.isFinite(v)) return String(v);
  const m = PARAM_META[key];
  if (!m) return v.toFixed(2);
  return `${m.toDisplay(v).toFixed(m.decimals)}${suffix(key, unit)}`;
}

/**
 * The value half of a change: `"1.20 → 1.80"`, or just `"1.80"` when there is no
 * distinct previous value to compare against.
 */
export function formatDeltaValue(
  key: string,
  before: unknown,
  after: unknown,
  unit?: LengthUnit,
): string {
  const to = formatValue(key, after, unit);
  if (before === undefined || before === null) return to;
  const from = formatValue(key, before, unit);
  return from === to ? to : `${from} → ${to}`;
}

/** Label and value together: `"Input r₂ 1.20 → 1.80"`. */
export function formatDelta(
  key: string,
  before: unknown,
  after: unknown,
  unit?: LengthUnit,
): string {
  return `${paramLabel(key)} ${formatDeltaValue(key, before, after, unit)}`;
}
