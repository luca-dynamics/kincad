import { describe, it, expect } from "vitest";
import {
  analyzeFourBar,
  couplerCurve,
  sweepFourBar,
  toRad,
  type FourBarLinkage,
  type SliderCrankLinkage,
} from "../../engine";
import {
  composeView,
  FIT,
  fitView,
  isFit,
  MAX_ZOOM,
  MIN_ZOOM,
  panAdjust,
  pointsFit,
  screenToWorld,
  worldToScreen,
  zoomAdjust,
} from "../view";
import {
  extentOf,
  fourBarPoints,
  geometryKey,
  mechanismExtent,
  mechanismPoints,
  posePoints,
  sliderCrankPoints,
} from "../extent";

/**
 * These cover the two halves of "the drawing stays inside the window": the FIT (does the computed
 * box actually contain the mechanism, at every pose and at every container size) and the MANUAL
 * layer stacked on it (does a zoom keep the point under the cursor, does a resize preserve it).
 *
 * The regression that started this is the first case below — the view was fitted to the coupler
 * curve plus a single pose at θ₂ = 0, so joints A and B walked outside the frame as soon as the
 * crank turned, and the output rocker was drawn off the edge of the canvas.
 */

const W = 900;
const H = 520;

/** The mechanism as it stood when the clipping was reported: r₁ = 5 after a chat edit, p = 2.8, δ₃ = 50°. */
const CLIPPED: FourBarLinkage = {
  ground: 5,
  input: 1.2,
  coupler: 3.5,
  output: 3,
  couplerPointDist: 2.8,
  couplerPointAngle: toRad(50),
  circuit: "open",
};

const SLIDER: SliderCrankLinkage = { crank: 1.4, rod: 4.5, offset: 0.6 };

const allPosesFit = (link: FourBarLinkage, view: ReturnType<typeof fitView>, pad = 0) =>
  sweepFourBar(link, 72).every((st) =>
    pointsFit([st.O2, st.O4, st.A, st.B, st.P], view, W, H, pad),
  );

describe("fitView — the swept envelope, not one pose", () => {
  it("contains every pose of the cycle, where the old single-pose fit did not", () => {
    // The old fit, reconstructed: the coupler curve plus the joints at θ₂ = 0 only.
    const p0 = analyzeFourBar(CLIPPED, 0);
    const oldView = fitView([...couplerCurve(CLIPPED, 180), p0.O2, p0.O4, p0.A, p0.B], W, H);
    expect(allPosesFit(CLIPPED, oldView)).toBe(false);

    expect(allPosesFit(CLIPPED, fitView(fourBarPoints(CLIPPED), W, H))).toBe(true);
  });

  it("contains the cycle at every container size, including a phone-width pane", () => {
    // A 70px margin per side is wider than some containers this canvas is given. Before the margin
    // was capped, `width - 2 * margin` went negative here and the fit came back MIRRORED — the
    // drawing was not merely clipped, it was inside out.
    for (const [w, h] of [
      [900, 520],
      [420, 300],
      [320, 180],
      [140, 90],
    ]) {
      const view = fitView(fourBarPoints(CLIPPED), w, h);
      expect(view.scale).toBeGreaterThan(0);
      for (const st of sweepFourBar(CLIPPED, 36)) {
        expect(pointsFit([st.O2, st.O4, st.A, st.B, st.P], view, w, h, 0)).toBe(true);
      }
    }
  });

  it("ignores non-finite points instead of collapsing the whole box", () => {
    // A non-assemblable pose reports NaN joints; one of them in the point list would make every
    // bound NaN and the scale NaN, which draws nothing at all.
    const clean = fitView([{ x: 0, y: 0 }, { x: 4, y: 2 }], W, H);
    const poisoned = fitView([{ x: 0, y: 0 }, { x: 4, y: 2 }, { x: NaN, y: 1 }], W, H);
    expect(poisoned).toEqual(clean);
  });

  it("returns a positive, finite scale even when the canvas is measured at zero size", () => {
    // A pane switching from display:none, or a canvas whose layout has not settled, reports
    // clientWidth/Height of ~0 for a frame or two. `width - 2 * margin` then goes negative and the
    // old fit came back with a NEGATIVE scale, which made drawGrid's grid step NaN and spun an
    // unbounded loop that froze the tab. The fit must stay positive and finite at any size.
    for (const [w, h] of [
      [0, 0],
      [1, 1],
      [8, 8],
      [7, 400],
    ]) {
      const view = fitView(fourBarPoints(CLIPPED), w, h);
      expect(Number.isFinite(view.scale)).toBe(true);
      expect(view.scale).toBeGreaterThan(0);
    }
  });

  it("centres the extent it was given", () => {
    const view = fitView([{ x: 0, y: 0 }, { x: 4, y: 0 }], W, H);
    const mid = worldToScreen({ x: 2, y: 0 }, view);
    expect(mid.x).toBeCloseTo(W / 2, 6);
    expect(mid.y).toBeCloseTo(H / 2, 6);
  });
});

describe("composeView — the manual layer", () => {
  const base = fitView(fourBarPoints(CLIPPED), W, H);

  it("is the fit itself until the user touches it", () => {
    expect(isFit(FIT)).toBe(true);
    expect(composeView(base, FIT, W, H)).toEqual(base);
  });

  it("keeps the world point under the cursor pinned while zooming", () => {
    const sx = 620;
    const sy = 180;
    const before = screenToWorld(sx, sy, composeView(base, FIT, W, H));
    const a = zoomAdjust(base, FIT, W, H, sx, sy, 2.5);
    const after = screenToWorld(sx, sy, composeView(base, a, W, H));
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(a.zoom).toBeCloseTo(2.5, 9);
    expect(isFit(a)).toBe(false);
  });

  it("stays pinned across a chain of zooms, in and back out", () => {
    const sx = 240;
    const sy = 400;
    const before = screenToWorld(sx, sy, base);
    let a = FIT;
    for (const f of [1.2, 1.2, 1.2, 0.8, 0.5, 1.6]) a = zoomAdjust(base, a, W, H, sx, sy, f);
    const after = screenToWorld(sx, sy, composeView(base, a, W, H));
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it("clamps how far the zoom can run", () => {
    let a = FIT;
    for (let i = 0; i < 40; i++) a = zoomAdjust(base, a, W, H, W / 2, H / 2, 2);
    expect(a.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 80; i++) a = zoomAdjust(base, a, W, H, W / 2, H / 2, 0.5);
    expect(a.zoom).toBe(MIN_ZOOM);
  });

  it("pans by whole screen pixels", () => {
    const a = panAdjust(panAdjust(FIT, 30, -12), -5, 4);
    const view = composeView(base, a, W, H);
    expect(view.cx).toBeCloseTo(base.cx + 25, 9);
    expect(view.cy).toBeCloseTo(base.cy - 8, 9);
    expect(view.scale).toBe(base.scale);
  });

  it("survives a resize with the user's zoom intact", () => {
    // What a refit on resize must not destroy: the fit underneath is recomputed for the new
    // container, the zoom multiplier on top is not.
    const a = zoomAdjust(base, FIT, W, H, W / 2, H / 2, 3);
    const narrower = fitView(fourBarPoints(CLIPPED), 500, 300);
    const view = composeView(narrower, a, 500, 300);
    expect(view.scale).toBeCloseTo(narrower.scale * 3, 9);
  });
});

describe("pointsFit", () => {
  const base = fitView(fourBarPoints(CLIPPED), W, H);

  it("accepts the fitted mechanism and rejects a point outside the frame", () => {
    expect(pointsFit(fourBarPoints(CLIPPED), base, W, H, 0)).toBe(true);
    expect(pointsFit([{ x: 500, y: 0 }], base, W, H, 0)).toBe(false);
  });

  it("holds the fitted points clear of the guard's own threshold", () => {
    // The render loop refits when a pose crosses 2px of the edge. If the fit itself parked points
    // closer than that, the guard would fire on every frame forever.
    expect(pointsFit(fourBarPoints(CLIPPED), base, W, H, 2)).toBe(true);
  });
});

describe("the render loop's containment guard", () => {
  const g = { kind: "fourbar" as const, fourbar: CLIPPED, slider: SLIDER };
  /** Non-Grashof: the input rocks instead of rotating, so the cycle sweep skips whole arcs. */
  const ROCKER: FourBarLinkage = {
    ground: 4,
    input: 2.5,
    coupler: 2.5,
    output: 2.5,
    couplerPointDist: 1.6,
    couplerPointAngle: toRad(35),
    circuit: "open",
  };

  /** Replays the guard exactly as the render loop runs it, one frame per angle. */
  const runGuard = (link: FourBarLinkage, w: number, h: number, frames = 1440) => {
    const geom = { kind: "fourbar" as const, fourbar: link, slider: SLIDER };
    let view = fitView(mechanismPoints(geom), w, h);
    let refits = 0;
    let repeats = 0;
    for (let i = 0; i <= frames; i++) {
      const pose = posePoints(geom, (i / frames) * Math.PI * 2);
      if (!pointsFit(pose, view, w, h, 2)) {
        view = fitView([...mechanismPoints(geom), ...pose], w, h);
        refits++;
        if (!pointsFit(pose, view, w, h, 2)) repeats++; // would fire again next frame: a loop
      }
    }
    return { refits, repeats };
  };

  it("stays quiet across a sweep 20× finer than the fit sampled", () => {
    // The fit samples one pose every 5°. If that were too coarse, the poses in between would cross
    // the edge and the guard would refit mid-animation — a visible rescale on a still mechanism.
    for (const [link, w, h] of [
      [CLIPPED, 900, 520],
      [CLIPPED, 320, 180],
      [ROCKER, 900, 520],
      [{ ...ROCKER, circuit: "crossed" } as FourBarLinkage, 900, 520],
    ] as const) {
      expect(runGuard(link, w, h)).toEqual({ refits: 0, repeats: 0 });
    }
  });

  it("cannot fire twice for the same pose", () => {
    // The guard's refit includes the pose that escaped, and fitView insets by more than the guard's
    // 2px threshold — so one refit always settles it. Without that ordering the loop would refit on
    // every frame forever.
    const view = fitView(mechanismPoints(g), W, H);
    const escaped = [...posePoints(g, 0), { x: 90, y: -40 }];
    expect(pointsFit(escaped, view, W, H, 2)).toBe(false);
    expect(pointsFit(escaped, fitView([...mechanismPoints(g), ...escaped], W, H), W, H, 2)).toBe(true);
  });
});

describe("extent", () => {
  it("spans the whole cycle, not the pose on screen", () => {
    const swept = extentOf(fourBarPoints(CLIPPED));
    const pose = extentOf(posePoints({ kind: "fourbar", fourbar: CLIPPED, slider: SLIDER }, 0));
    expect(swept.width).toBeGreaterThan(pose.width);
    expect(swept.height).toBeGreaterThan(pose.height);
    expect(swept.min.x).toBeLessThanOrEqual(pose.min.x);
    expect(swept.max.x).toBeGreaterThanOrEqual(pose.max.x);
  });

  it("always includes both fixed pivots, even when nothing assembles", () => {
    const impossible: FourBarLinkage = { ...CLIPPED, ground: 40 }; // r₁ far beyond r₂ + r₃ + r₄
    expect(sweepFourBar(impossible, 72)).toHaveLength(0);
    const e = extentOf(fourBarPoints(impossible));
    expect(e.min.x).toBeLessThanOrEqual(0);
    expect(e.max.x).toBeGreaterThanOrEqual(40);
    expect(e.height).toBeGreaterThan(0); // a zero-height box would divide by ~0 in the fit
  });

  it("reaches both dead centres of a slider-crank", () => {
    const e = extentOf(sliderCrankPoints(SLIDER));
    // The slider pin's travel: the far dead centre is at most r₂ + r₃ from O₂ along x.
    expect(e.max.x).toBeGreaterThan(SLIDER.rod);
    expect(e.max.x).toBeLessThanOrEqual(SLIDER.crank + SLIDER.rod + 1e-9);
    expect(e.min.y).toBeLessThan(0); // the crank dips below the slider line
  });

  it("returns a usable zero box for no points", () => {
    expect(extentOf([])).toEqual({
      min: { x: 0, y: 0 },
      max: { x: 0, y: 0 },
      center: { x: 0, y: 0 },
      width: 0,
      height: 0,
    });
  });

  it("frames the 3D view from the same numbers", () => {
    const e = mechanismExtent({ kind: "fourbar", fourbar: CLIPPED, slider: SLIDER });
    expect(e).toEqual(extentOf(fourBarPoints(CLIPPED)));
  });
});

describe("geometryKey", () => {
  const g = { kind: "fourbar" as const, fourbar: CLIPPED, slider: SLIDER };

  it("changes for every dimension the fitted box depends on", () => {
    const base = geometryKey(g);
    expect(geometryKey({ ...g, fourbar: { ...CLIPPED, ground: 5.1 } })).not.toBe(base);
    expect(geometryKey({ ...g, fourbar: { ...CLIPPED, couplerPointAngle: 0 } })).not.toBe(base);
    expect(geometryKey({ ...g, fourbar: { ...CLIPPED, circuit: "crossed" } })).not.toBe(base);
    expect(geometryKey({ ...g, kind: "slidercrank" })).not.toBe(base);
  });

  it("does not change when only the crank angle moves", () => {
    // The reason the key exists: θ₂ is patched 60×/s while the animation plays, and refitting on
    // each tick would rescale the drawing continuously.
    expect(geometryKey({ ...g, fourbar: { ...CLIPPED } })).toBe(geometryKey(g));
    expect(geometryKey({ ...g, slider: { ...SLIDER } })).toBe(geometryKey(g));
  });
});
