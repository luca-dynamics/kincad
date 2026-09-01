import { describe, it, expect } from "vitest";
import { fromMm, len, lenLabel, LENGTH_UNITS } from "../units";

/**
 * The two length formatters that sit ON the geometry rather than in a table, plus the one conversion
 * in the app. Both are pure, and both are read straight off a viewport where a wrong number is
 * indistinguishable from a right one — a dimension tag has no units column to cross-check against.
 */

describe("fromMm — the CAD side's real conversion", () => {
  it("converts a millimetre length into each unit", () => {
    expect(fromMm(600, "mm")).toBe(600);
    expect(fromMm(600, "cm")).toBe(60);
    expect(fromMm(600, "m")).toBe(0.6);
    expect(fromMm(25.4, "in")).toBeCloseTo(1, 12);
  });

  it("is the identity in millimetres, for every magnitude", () => {
    // The generator authors in mm, so this is the common path and must not perturb the number.
    for (const v of [0, 0.1, 6, 42.5, 600, 1999.99]) expect(fromMm(v, "mm")).toBe(v);
  });

  it("round-trips back to millimetres", () => {
    const MM_PER: Record<(typeof LENGTH_UNITS)[number], number> = { mm: 1, cm: 10, m: 1000, in: 25.4 };
    for (const u of LENGTH_UNITS) expect(fromMm(600, u) * MM_PER[u]).toBeCloseTo(600, 9);
  });
});

describe("lenLabel — a length small enough to sit on a link", () => {
  it("drops trailing zeros", () => {
    expect(lenLabel(4, "mm")).toBe("4 mm");
    expect(lenLabel(1.2, "mm")).toBe("1.2 mm");
    expect(lenLabel(3.5, "mm")).toBe("3.5 mm");
  });

  it("keeps roughly three significant figures at every magnitude", () => {
    // The point of the ladder: one 6 mm hole, four units, all four readable.
    expect(lenLabel(fromMm(6, "mm"), "mm")).toBe("6 mm");
    expect(lenLabel(fromMm(6, "cm"), "cm")).toBe("0.6 cm");
    expect(lenLabel(fromMm(6, "m"), "m")).toBe("0.006 m");
    expect(lenLabel(fromMm(6, "in"), "in")).toBe("0.236 in");
  });

  it("does not pad a large number with decimals", () => {
    expect(lenLabel(600, "mm")).toBe("600 mm");
    expect(lenLabel(1234.56, "mm")).toBe("1235 mm");
    expect(lenLabel(60, "cm")).toBe("60 cm");
  });

  it("survives what a solver actually hands it", () => {
    // Lengths are measured from the pose, so they arrive with float noise on them: the label must
    // read as the dimension the user typed, not as its representation.
    expect(lenLabel(3.4999999999999996, "mm")).toBe("3.5 mm");
    expect(lenLabel(0, "mm")).toBe("0 mm");
  });

  it("is shorter than the report's table format for the same length", () => {
    // The distinction the two functions exist for. `len` lines a column up; this one competes with
    // the mechanism behind it.
    expect(len(1.2, "mm")).toBe("1.2000 mm");
    expect(lenLabel(1.2, "mm").length).toBeLessThan(len(1.2, "mm").length);
  });
});
