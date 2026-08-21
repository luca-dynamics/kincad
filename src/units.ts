// The workspace length unit — a DECLARATION, not a conversion.
//
// WHY IT EXISTS. The kinematics engine is scale-free: loop closure and Freudenstein's equation are
// homogeneous in length, so the joint angles, the Grashof classification and the transmission angle
// depend only on the ratios r₁ : r₂ : r₃ : r₄. A stored length of 4 is therefore 4 of whatever the
// engineer decided the workspace is drawn in, and the engine neither knows nor needs to know which.
//
// That fact used to be printed literally. The report read `4.0000 units`, the narration
// `≈ 3.21 × 1.84 units`, and the slider-crank plot axes were labelled `x`, `v` and `a` — every one
// of them true, and every one of them useless on a marking sheet, where "units" reads as a
// placeholder nobody replaced. So the unit is declared once, in the parameter dock, and every
// figure that has a length in it prints that unit.
//
// WHAT THIS DELIBERATELY IS NOT. Changing the unit does not rescale anything: 4 stays 4, the
// mechanism on screen does not move, and no velocity changes. A rescale would silently rewrite
// stored geometry — and every velocity and acceleration derived from it — behind what the user
// experienced as a label change, for a quantity the solver never consumes. This module states what
// the numbers already mean; `scaleFreeNote` is what says so on the page.

export type LengthUnit = "mm" | "cm" | "m" | "in";

/** Millimetres, because that is what the CAD side of the app is already in (see cad/build.ts). */
export const DEFAULT_UNIT: LengthUnit = "mm";

/**
 * The declarable units, in the order the dock offers them. Four, and metric-first: the segmented
 * control has one row, and this is the set an ME undergraduate dimensions a linkage in.
 */
export const LENGTH_UNITS: readonly LengthUnit[] = ["mm", "cm", "m", "in"];

/**
 * The units spelled out, for PROSE.
 *
 * `len` prints the symbol, because that is what a table column and a plot axis want. A sentence
 * wants the word: every phrasing that puts the unit after a preposition produces "stated in in" for
 * inches, and a report that reads like that reads like a template nobody finished. Both the report's
 * heading note and `scaleFreeNote` go through here; the symbol still follows in brackets, because the
 * symbol is what every figure on the page is labelled with.
 */
export const UNIT_NAME: Record<LengthUnit, string> = {
  mm: "millimetres",
  cm: "centimetres",
  m: "metres",
  in: "inches",
};

/** A length with its unit: `4.0000 mm`. */
export function len(v: number, unit: LengthUnit, decimals = 4): string {
  return `${v.toFixed(decimals)} ${unit}`;
}

/** Linear velocity: `mm/s`. */
export function perSec(unit: LengthUnit): string {
  return `${unit}/s`;
}

/** Linear acceleration: `mm/s²`. The superscript is a real one — report/math.ts raises it. */
export function perSec2(unit: LengthUnit): string {
  return `${unit}/s²`;
}

/**
 * The sentence that keeps the declaration honest, printed on every analysis report.
 *
 * Without it a reader could reasonably infer the solver was given millimetres and worked in them.
 * It was not: the unit is the engineer's statement about their own numbers, so the sheet says both
 * what was declared and exactly how much of the analysis depends on it — the angles not at all, the
 * linear velocities and accelerations by one common factor.
 *
 * `ratios` is the mechanism's own set of lengths, e.g. `"r₁ : r₂ : r₃ : r₄"`. It is a parameter
 * rather than a constant because this note is printed on the slider-crank sheet too, and naming an
 * r₄ that mechanism does not have is the exact defect the report's second rule was written for.
 */
export function scaleFreeNote(unit: LengthUnit, ratios: string): string {
  return (
    `Lengths are stated in ${UNIT_NAME[unit]} (${unit}), the unit declared for this workspace. ` +
    "The analysis itself is " +
    "scale-free: the loop-closure equations are homogeneous in length, so every angle, the " +
    "assembly and rotatability checks and the transmission angle depend only on the ratios " +
    `${ratios}. Reading the same link lengths in a different unit scales the linear velocities ` +
    "and accelerations by that one factor and changes nothing else."
  );
}
