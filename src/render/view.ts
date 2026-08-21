// World <-> screen mapping for the CAD canvas.
// World units are the engine's length units (mm by convention). +y is UP in world space
// (engineering convention) but DOWN in canvas space, so the transform flips y.
//
// There are TWO layers here and they are deliberately not merged. `fitView` is the auto-fit: the
// transform that puts the whole mechanism inside the container it is drawn in. `ViewAdjust` is
// whatever the user has since done by hand — scroll to zoom, drag to pan — and `composeView`
// stacks the second onto the first. Folding a manual zoom into the fitted View (the obvious
// simplification) is what makes the two impossible to separate again: the fit has to be recomputed
// on every geometry edit and every resize, and each recompute would silently discard the zoom the
// user set. Split, "Fit" is a one-field reset and auto-fit can run as often as it likes.

import type { Vec2 } from "../engine";

export interface View {
  scale: number; // pixels per world unit
  cx: number; // screen pixel that maps to world origin x
  cy: number; // screen pixel that maps to world origin y
}

/** A manual zoom/pan applied ON TOP of the auto-fit. `FIT` means "exactly the auto-fit". */
export interface ViewAdjust {
  /** Multiplier on the fitted scale. */
  zoom: number;
  /** Pan in screen pixels, applied after the zoom. */
  dx: number;
  dy: number;
}

export const FIT: ViewAdjust = { zoom: 1, dx: 0, dy: 0 };
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 25;

/** True while the view is still the plain auto-fit, i.e. nothing to reset and safe to refit. */
export const isFit = (a: ViewAdjust) => a.zoom === 1 && a.dx === 0 && a.dy === 0;

export const worldToScreen = (p: Vec2, view: View): Vec2 => ({
  x: view.cx + p.x * view.scale,
  y: view.cy - p.y * view.scale,
});

export const screenToWorld = (sx: number, sy: number, view: View): Vec2 => ({
  x: (sx - view.cx) / view.scale,
  y: -(sy - view.cy) / view.scale,
});

/** Fit a set of world points into the canvas with margin, returning a centred View. */
export function fitView(
  points: Vec2[],
  width: number,
  height: number,
  margin = 70,
): View {
  if (points.length === 0) return { scale: 40, cx: width / 2, cy: height / 2 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue; // a non-assemblable pose poisons the box
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) return { scale: 40, cx: width / 2, cy: height / 2 };
  const w = Math.max(maxX - minX, 1e-3);
  const h = Math.max(maxY - minY, 1e-3);
  // The margin has to yield to the container. A fixed 70px inset is fine on a desktop canvas and
  // wider than the whole viewport on a phone in a split pane — where `width - 2 * margin` goes
  // NEGATIVE and the fit comes back mirrored and off-screen. Cap it at a fraction of each side.
  const mx = Math.max(4, Math.min(margin, width * 0.15));
  const my = Math.max(4, Math.min(margin, height * 0.15));
  const scale = Math.min((width - 2 * mx) / w, (height - 2 * my) / h);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    scale,
    cx: width / 2 - midX * scale,
    cy: height / 2 + midY * scale,
  };
}

/** Stack a manual zoom/pan onto a fitted view. */
export function composeView(
  base: View,
  a: ViewAdjust,
  width: number,
  height: number,
): View {
  if (isFit(a)) return base;
  // Zoom about the CENTRE OF THE CANVAS, not about the world origin. The origin is O2 — the crank
  // pivot, off to one side of every mechanism — so zooming about it walks the drawing out of frame.
  return {
    scale: base.scale * a.zoom,
    cx: width / 2 + (base.cx - width / 2) * a.zoom + a.dx,
    cy: height / 2 + (base.cy - height / 2) * a.zoom + a.dy,
  };
}

/**
 * Zoom by `factor` while pinning the world point under (sx, sy) to that same pixel — the behaviour
 * every map and CAD tool has, and the reason the pan offset is adjusted here rather than left
 * alone: scaling about the canvas centre alone would slide whatever is under the cursor away.
 */
export function zoomAdjust(
  base: View,
  a: ViewAdjust,
  width: number,
  height: number,
  sx: number,
  sy: number,
  factor: number,
): ViewAdjust {
  const zoom = clamp(a.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === a.zoom) return a;
  const anchor = screenToWorld(sx, sy, composeView(base, a, width, height));
  const moved = worldToScreen(anchor, composeView(base, { ...a, zoom }, width, height));
  return { zoom, dx: a.dx + (sx - moved.x), dy: a.dy + (sy - moved.y) };
}

/** Pan by a screen-pixel delta. */
export const panAdjust = (a: ViewAdjust, dx: number, dy: number): ViewAdjust => ({
  zoom: a.zoom,
  dx: a.dx + dx,
  dy: a.dy + dy,
});

/**
 * Whether every point still lands inside the container. This is the auto-fit's trigger of last
 * resort: geometry can leave the frame without any parameter changing — the crank sweeps through
 * poses the fit never sampled — and a drawing running off the edge is the one state this view must
 * not sit in.
 */
export function pointsFit(
  points: Vec2[],
  view: View,
  width: number,
  height: number,
  pad = 6,
): boolean {
  for (const p of points) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    const s = worldToScreen(p, view);
    if (s.x < pad || s.y < pad || s.x > width - pad || s.y > height - pad) return false;
  }
  return true;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
