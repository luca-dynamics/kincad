import { describe, it, expect } from "vitest";
import type { FourBarLinkage, FourBarReport, SliderCrankReport } from "../engine";
import { DEFAULT_FOURBAR, DEFAULT_OMEGA2, DEFAULT_SLIDER } from "../state";
import { compareMetrics, metrics, reportFor, warningDelta } from "../insight";
import { PLOT_PAD, fractionAtX } from "../render/plot";

// Every helper sweeps at the workspace's own default speed, not the engine's unit rate — these
// tests should be reading the figures the interface reads.
const fourbar = (over: Partial<FourBarLinkage> = {}) =>
  reportFor(
    { kind: "fourbar", fourbar: { ...DEFAULT_FOURBAR, ...over }, slider: DEFAULT_SLIDER },
    DEFAULT_OMEGA2,
  ) as FourBarReport;

const slidercrank = (over: Partial<typeof DEFAULT_SLIDER> = {}) =>
  reportFor(
    { kind: "slidercrank", fourbar: DEFAULT_FOURBAR, slider: { ...DEFAULT_SLIDER, ...over } },
    DEFAULT_OMEGA2,
  ) as SliderCrankReport;

/** Look a row up by key — the tests assert on figures, not on row order. */
const row = (rows: ReturnType<typeof metrics>, key: string) => rows.find((m) => m.key === key);

// Every `metrics` / `compareMetrics` call below names its unit, because neither takes a default —
// see the docblock in insight.ts. `mm` is the workspace default and what most of these read in; the
// two unit-labelling tests pass something else on purpose, so a hardcoded `mm` cannot pass them.

/**
 * A real report with its minimum transmission angle moved to `deg`. Built by overriding a solved
 * report rather than by hand so the shape stays whatever the engine actually produces, while the
 * one number the guideline test turns on is exact — searching for a geometry whose μ min lands
 * either side of 40° would make the threshold assertion depend on the solver, which is the thing
 * being held constant here.
 */
function withMuMin(base: FourBarReport, deg: number, warnings = base.warnings): FourBarReport {
  return {
    ...base,
    transmission: { ...base.transmission, min: { value: deg, atTheta2Deg: 27 } },
    warnings,
  };
}

describe("metrics — four-bar", () => {
  it("labels the headline cycle figures, formatted for a human", () => {
    const rep = fourbar();
    const rows = metrics(rep, "mm");

    expect(row(rows, "grashof")?.value).toBe("crank-rocker");
    expect(row(rows, "rotation")?.value).toBe("fully");
    // Every figure is the report's own, only formatted — a mismatch here means the strip could
    // print a number the solver never produced.
    expect(row(rows, "muMin")?.value).toBe(`${rep.transmission.min.value.toFixed(1)}°`);
    expect(row(rows, "muMax")?.value).toBe(`${rep.transmission.max.value.toFixed(1)}°`);
    expect(row(rows, "muMean")?.value).toBe(`${rep.transmission.mean.toFixed(1)}°`);
    expect(row(rows, "omega4")?.value).toBe(
      `${rep.omega4.min.value.toFixed(2)} … ${rep.omega4.max.value.toFixed(2)} rad/s`,
    );
  });

  it("says where in the cycle an extremum occurs, in degrees", () => {
    const rows = metrics(fourbar(), "mm");
    expect(row(rows, "muMin")?.detail).toMatch(/^at θ₂ = \d+°$/);
  });

  it("omits every cycle figure when the linkage never assembles", () => {
    // coupler + output = 2 can never span ground - input = 2.8, so the sweep yields no states and
    // report.ts leaves its extrema seeded at ±Infinity — and its μ mean at a misleading 0.
    const rows = metrics(fourbar({ coupler: 1, output: 1 }), "mm");
    expect(rows.map((m) => m.key)).toEqual(["grashof", "rotation"]);
    expect(row(rows, "rotation")?.value).toBe("does not assemble");
    expect(rows.some((m) => m.value === "0.0°")).toBe(false);
  });

  it("reports a partial arc as limited, with how much of the revolution is reachable", () => {
    const rows = metrics(fourbar({ input: 3.5, coupler: 2, output: 2 }), "mm");
    const rotation = row(rows, "rotation");
    expect(rotation?.value).toBe("limited");
    expect(rotation?.detail).toMatch(/of 360° reachable$/);
  });

  it("states the coupler envelope's unit once, after the height", () => {
    // `3.21 × 1.84 cm`, not `3.21 cm × 1.84 cm` and not the `units²` it used to print — the
    // envelope is a bounding box, so it is a size, and a size is not an area.
    const rep = fourbar();
    expect(row(metrics(rep, "cm"), "coupler")?.value).toBe(
      `${rep.couplerExtent.width.toFixed(2)} × ${rep.couplerExtent.height.toFixed(2)} cm`,
    );
  });
});

describe("metrics — slider-crank", () => {
  it("mirrors the precision the parameter dock prints", () => {
    const rep = slidercrank();
    const rows = metrics(rep, "mm");
    expect(row(rows, "stroke")?.value).toBe(`${rep.stroke.toFixed(3)} mm`);
    expect(row(rows, "muMin")?.value).toBe(`${rep.transmission.min.value.toFixed(1)}°`);
  });

  it("reports the larger magnitude of each range as the peak", () => {
    const rep = slidercrank();
    const peak = Math.max(Math.abs(rep.sliderVel.min.value), Math.abs(rep.sliderVel.max.value));
    expect(row(metrics(rep, "mm"), "velMax")?.value).toBe(`${peak.toFixed(3)} mm/s`);
  });

  it("labels every linear figure with the DECLARED unit and no angle with it", () => {
    // The defect this guards is the one the report was shipped with: a stroke printed as a bare
    // number, or as `units`, while the workspace said inches. Deliberately not "mm", so a
    // hardcoded default cannot pass.
    const rep = slidercrank();
    const rows = metrics(rep, "in");
    expect(row(rows, "stroke")?.value).toBe(`${rep.stroke.toFixed(3)} in`);
    expect(row(rows, "velMax")?.value).toMatch(/ in\/s$/);
    expect(row(rows, "accMax")?.value).toMatch(/ in\/s²$/);
    // μ is an angle. It must not pick the length unit up on its way through.
    expect(row(rows, "muMin")?.value).toMatch(/°$/);
  });

  it("carries no reachable-arc detail, because the slider report publishes none", () => {
    // The four-bar report has `reachableArcDeg`; this one does not, and the row must not invent it.
    expect(row(metrics(slidercrank(), "mm"), "rotation")?.detail).toBeUndefined();
  });
});

describe("compareMetrics", () => {
  it("drops rows that did not move", () => {
    const rep = fourbar();
    expect(compareMetrics(rep, rep, "mm")).toEqual([]);
  });

  it("annotates a moved row with where it came from", () => {
    const before = fourbar();
    const after = fourbar({ coupler: 3.8 });
    const muMin = row(compareMetrics(before, after, "mm"), "muMin");
    expect(muMin?.from).toBe(`${before.transmission.min.value.toFixed(1)}°`);
    expect(muMin?.value).toBe(`${after.transmission.min.value.toFixed(1)}°`);
  });

  it("surfaces a Grashof reclassification as a plain text delta", () => {
    const rows = compareMetrics(fourbar(), fourbar({ input: 3.5, coupler: 2, output: 2 }), "mm");
    expect(row(rows, "grashof")).toMatchObject({ from: "crank-rocker" });
    expect(row(rows, "grashof")?.value).not.toBe("crank-rocker");
    // No trend on a classification: the engine publishes no rule that makes one type "better".
    expect(row(rows, "grashof")?.trend).toBeUndefined();
  });

  it("states a rotation loss instead of silently dropping the cycle rows", () => {
    const rows = compareMetrics(fourbar(), fourbar({ coupler: 1, output: 1 }), "mm");
    expect(row(rows, "rotation")).toMatchObject({ from: "fully", value: "does not assemble" });
  });

  it("keeps a row with no counterpart, without inventing a `from`", () => {
    // Switching mechanism kind: `stroke` has nothing to compare against.
    const rows = compareMetrics(fourbar(), slidercrank(), "mm");
    expect(row(rows, "stroke")?.from).toBeUndefined();
    expect(row(rows, "stroke")?.value).toBeDefined();
  });
});

describe("compareMetrics — the transmission-angle guideline", () => {
  const base = fourbar();
  const guide = base.transmission.poorBelowDeg;

  it("marks a crossing below the guideline as moving away from the rule", () => {
    const rows = compareMetrics(withMuMin(base, guide + 8), withMuMin(base, guide - 2), "mm");
    expect(row(rows, "muMin")).toMatchObject({ trend: "away-from-rule" });
    expect(row(rows, "muMin")?.detail).toBe(`now below the ${guide}° guideline`);
  });

  it("marks a crossing back above it as moving toward the rule", () => {
    const rows = compareMetrics(withMuMin(base, guide - 2), withMuMin(base, guide + 8), "mm");
    expect(row(rows, "muMin")).toMatchObject({ trend: "toward-rule" });
    expect(row(rows, "muMin")?.detail).toBe(`back above the ${guide}° guideline`);
  });

  it("stays silent when both values sit on the same side, however far they move", () => {
    // A large, unambiguous improvement — still no trend, because no published rule was crossed.
    // This is the "no invented judgements" rule: 12° → 39° is better engineering, but the engine
    // says nothing about it, so neither does the interface.
    const worse = compareMetrics(withMuMin(base, guide - 28), withMuMin(base, guide - 1), "mm");
    expect(row(worse, "muMin")?.trend).toBeUndefined();
    const better = compareMetrics(withMuMin(base, guide + 1), withMuMin(base, guide + 30), "mm");
    expect(row(better, "muMin")?.trend).toBeUndefined();
  });

  it("stays silent when a geometry has no minimum to compare", () => {
    const rows = compareMetrics(fourbar(), fourbar({ coupler: 1, output: 1 }), "mm");
    expect(row(rows, "muMin")).toBeUndefined();
  });

  it("never fires on a slider-crank, whose report publishes no threshold", () => {
    const rows = compareMetrics(slidercrank(), slidercrank({ rod: 2.5 }), "mm");
    for (const m of rows) expect(m.trend).toBeUndefined();
  });
});

describe("warningDelta", () => {
  const base = fourbar();
  const poor = "Transmission angle drops to 31.4° near θ2 = 27° — below the 40° guideline.";
  const rotation = "The input link cannot make a full revolution (it is not the crank).";

  it("counts a warning the change resolves", () => {
    expect(warningDelta(withMuMin(base, 31, [poor]), withMuMin(base, 52, []))).toEqual({
      cleared: 1,
      introduced: [],
    });
  });

  it("lists an introduced warning in the engine's own words", () => {
    const d = warningDelta(withMuMin(base, 52, []), withMuMin(base, 31, [poor]));
    expect(d).toEqual({ cleared: 0, introduced: [poor] });
  });

  it("treats the same rule with different numbers as unchanged, not as churn", () => {
    // The bug this guards: the engine embeds live figures in its warning text, so a raw string
    // compare reports one warning as BOTH cleared and introduced on any nudge of the geometry.
    const a = withMuMin(base, 31, ["Transmission angle drops to 31.4° near θ2 = 27° — below the 40° guideline."]);
    const b = withMuMin(base, 30, ["Transmission angle drops to 30.2° near θ2 = 31° — below the 40° guideline."]);
    expect(warningDelta(a, b)).toEqual({ cleared: 0, introduced: [] });
  });

  it("tracks each rule independently", () => {
    const d = warningDelta(withMuMin(base, 31, [poor]), withMuMin(base, 52, [rotation]));
    expect(d).toEqual({ cleared: 1, introduced: [rotation] });
  });

  it("finds the real warnings on a linkage that cannot be driven", () => {
    const broken = fourbar({ coupler: 1, output: 1 });
    const d = warningDelta(fourbar(), broken);
    expect(d.cleared).toBe(0);
    expect(d.introduced).toEqual(broken.warnings);
    expect(d.introduced.length).toBeGreaterThan(0);
  });
});

describe("reportFor", () => {
  it("builds the report matching the selected mechanism, not both", () => {
    const linkages = { kind: "slidercrank" as const, fourbar: DEFAULT_FOURBAR, slider: DEFAULT_SLIDER };
    expect(reportFor(linkages, DEFAULT_OMEGA2).kind).toBe("slidercrank");
    expect(reportFor({ ...linkages, kind: "fourbar" }, DEFAULT_OMEGA2).kind).toBe("fourbar");
  });

  it("sweeps at the same resolution as the parameter dock", () => {
    // Both call sites pass 360; a mismatch would show the same geometry with two different extrema
    // in two places on screen.
    const rep = fourbar();
    expect(rep.reachableArcDeg).toBeCloseTo(360, 6);
  });
});

describe("fractionAtX", () => {
  const W = 300;
  const right = W - PLOT_PAD.r;

  it("maps the plot box onto the cycle", () => {
    expect(fractionAtX(PLOT_PAD.l, W)).toBe(0);
    expect(fractionAtX(right, W)).toBe(1);
    expect(fractionAtX((PLOT_PAD.l + right) / 2, W)).toBeCloseTo(0.5, 10);
  });

  it("clamps within the grab margin so a touch on the axis still scrubs", () => {
    expect(fractionAtX(PLOT_PAD.l - 4, W)).toBe(0);
    expect(fractionAtX(right + 4, W)).toBe(1);
  });

  it("returns null outside the box, so a drag off the plot stops scrubbing", () => {
    expect(fractionAtX(0, W)).toBeNull();
    expect(fractionAtX(W, W)).toBeNull();
    expect(fractionAtX(-20, W)).toBeNull();
  });

  it("returns null rather than dividing by zero on a collapsed canvas", () => {
    expect(fractionAtX(10, PLOT_PAD.l + PLOT_PAD.r)).toBeNull();
    expect(fractionAtX(10, 0)).toBeNull();
  });
});
