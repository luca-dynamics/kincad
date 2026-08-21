import { describe, it, expect } from "vitest";
import { toRad } from "../engine";
import { PARAM_META, formatDelta, formatDeltaValue, formatValue, paramLabel } from "../params";

describe("formatValue", () => {
  it("shows the coupler-point angle in degrees, never stored radians", () => {
    // The bug this guards: the chat trace used to print `couplerPointAngle=0.6108652381980153`.
    expect(formatValue("couplerPointAngle", toRad(35))).toBe("35°");
    expect(formatValue("couplerPointAngle", toRad(-90))).toBe("-90°");
    expect(formatValue("couplerPointAngle", 0.6108652381980153)).not.toMatch(/0\.61/);
  });

  it("shows lengths with two decimals and no unit when none is declared", () => {
    // A length is genuinely unitless until a workspace declares one, and a caller with no
    // workspace in scope must not be forced to invent a unit — see formatValue's docblock.
    expect(formatValue("input", 1.2)).toBe("1.20");
    expect(formatValue("rod", 5)).toBe("5.00");
  });

  it("appends the declared unit to a length, and only to a length", () => {
    expect(formatValue("input", 1.2, "mm")).toBe("1.20 mm");
    expect(formatValue("rod", 5, "in")).toBe("5.00 in");
    expect(formatValue("offset", -0.5, "cm")).toBe("-0.50 cm");
    // The angle keeps its own unit, which no declaration can change; the enum takes none at all.
    expect(formatValue("couplerPointAngle", toRad(35), "in")).toBe("35°");
    expect(formatValue("circuit", "crossed", "in")).toBe("Crossed");
  });

  it("leaves an unknown key unitless even when a unit is declared", () => {
    // `PARAM_META` is what says a value is a LENGTH. Guessing that an unrecognised key is one
    // would put "mm" on the first non-length parameter anything ever adds.
    expect(formatValue("someFutureParam", 3, "mm")).toBe("3.00");
  });

  it("title-cases enum params to match the dock's toggle", () => {
    expect(formatValue("circuit", "crossed")).toBe("Crossed");
  });

  it("falls back to two decimals for keys it has never heard of", () => {
    expect(formatValue("someFutureParam", 3)).toBe("3.00");
  });

  it("passes non-finite values through instead of printing NaN-with-a-unit", () => {
    expect(formatValue("ground", Number.NaN)).toBe("NaN");
    expect(formatValue("ground", undefined)).toBe("undefined");
  });
});

describe("formatDeltaValue", () => {
  it("renders a real change as before → after", () => {
    expect(formatDeltaValue("rod", 4, 5)).toBe("4.00 → 5.00");
  });

  it("converts BOTH halves of an angle delta", () => {
    expect(formatDeltaValue("couplerPointAngle", toRad(35), toRad(50))).toBe("35° → 50°");
  });

  it("drops the arrow when the displayed value is unchanged", () => {
    // A model re-sending an identical param shouldn't produce "4.00 → 4.00".
    expect(formatDeltaValue("rod", 4, 4)).toBe("4.00");
    // Sub-precision noise reads as unchanged too, because that is what the user sees.
    expect(formatDeltaValue("rod", 4, 4.0001)).toBe("4.00");
  });

  it("shows only the new value when there is no prior state to compare", () => {
    expect(formatDeltaValue("rod", undefined, 5)).toBe("5.00");
  });

  it("repeats the declared unit on both halves, as the angle already does", () => {
    // Both halves, not one: "4.00 → 5.00 mm" reads as a range in millimetres rather than as a
    // change from one length to another, and the degree rows have always been written this way.
    expect(formatDeltaValue("rod", 4, 5, "mm")).toBe("4.00 mm → 5.00 mm");
    expect(formatDeltaValue("rod", undefined, 5, "in")).toBe("5.00 in");
    // Unchanged stays a single value, unit and all.
    expect(formatDeltaValue("rod", 4, 4.0001, "mm")).toBe("4.00 mm");
  });
});

describe("paramLabel / formatDelta", () => {
  it("labels every parameter the dock can edit", () => {
    for (const key of ["ground", "input", "coupler", "output", "couplerPointDist", "couplerPointAngle", "circuit", "crank", "rod", "offset"]) {
      expect(paramLabel(key)).toBe(PARAM_META[key].label);
      expect(paramLabel(key)).not.toBe(key);
    }
  });

  it("falls back to the raw key rather than rendering nothing", () => {
    expect(paramLabel("mysteryParam")).toBe("mysteryParam");
  });

  it("joins label and value for the approval flow's benefit", () => {
    expect(formatDelta("input", 1.2, 1.8)).toBe("Input r₂ 1.20 → 1.80");
  });
});

describe("PARAM_META unit conversion", () => {
  it("round-trips display → stored → display for every param", () => {
    for (const [key, m] of Object.entries(PARAM_META)) {
      expect(m.toDisplay(m.toStored(35)), key).toBeCloseTo(35, 10);
    }
  });
});
