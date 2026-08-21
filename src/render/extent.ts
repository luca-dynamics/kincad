// How much WORLD SPACE a mechanism needs — over its whole cycle, not at one crank angle.
//
// Both the 2D canvas and the 3D view frame themselves from this. The distinction is the whole point
// of the module: a four-bar at θ₂ = 0 fills a box that joints A and B leave the moment the
// animation starts — A sweeps a circle of radius r₂ about O₂, B an arc of radius r₄ about O₄ — so a
// fit computed from a single pose clips the mechanism as soon as it moves, which is exactly how the
// output rocker ended up drawn off the edge of the canvas.

import {
  analyzeFourBar,
  analyzeSliderCrank,
  sweepFourBar,
  sweepSliderCrank,
  type FourBarLinkage,
  type SliderCrankLinkage,
  type Vec2,
} from "../engine";
import type { MechanismKind } from "../state";

/** The geometry an extent depends on. `WorkspaceState` satisfies this structurally. */
export interface MechanismGeometry {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
}

/**
 * Cycle resolution: 72 samples is one pose every 5°, close enough to the true envelope for a view
 * that adds a margin anyway, and cheap enough to recompute on every parameter edit.
 */
export const SWEEP_STEPS = 72;

/** Every point the four-bar drawing can occupy across a full input cycle. */
export function fourBarPoints(link: FourBarLinkage, steps = SWEEP_STEPS): Vec2[] {
  // Both fixed pivots are drawn even when the linkage cannot assemble, so they are always in.
  const pts: Vec2[] = [
    { x: 0, y: 0 },
    { x: link.ground, y: 0 },
  ];
  for (const st of sweepFourBar(link, steps)) pts.push(st.A, st.B, st.P);
  if (pts.length === 2) {
    // Nothing assembles at any input angle. Frame the crank circle rather than the bare ground
    // line, so the user is looking at the linkage they typed instead of two pivots blown up to
    // fill the canvas.
    const r = Math.max(link.input, link.output);
    pts.push({ x: -r, y: -r }, { x: link.ground + r, y: r });
  }
  return pts;
}

/** Every point the slider-crank drawing can occupy across a full crank cycle. */
export function sliderCrankPoints(link: SliderCrankLinkage, steps = SWEEP_STEPS): Vec2[] {
  const pts: Vec2[] = [{ x: 0, y: 0 }];
  for (const st of sweepSliderCrank(link, steps)) pts.push(st.A, st.B);
  if (pts.length === 1) {
    const r = link.crank + link.rod;
    pts.push({ x: -link.crank, y: -link.crank }, { x: r, y: link.crank });
  }
  return pts;
}

export function mechanismPoints(g: MechanismGeometry, steps = SWEEP_STEPS): Vec2[] {
  return g.kind === "fourbar"
    ? fourBarPoints(g.fourbar, steps)
    : sliderCrankPoints(g.slider, steps);
}

/**
 * The points on screen at ONE input angle — what the containment check tests. Cheap (one solve),
 * unlike the full sweep, so the render loop can afford it every frame.
 */
export function posePoints(g: MechanismGeometry, theta2: number): Vec2[] {
  if (g.kind === "fourbar") {
    const st = analyzeFourBar(g.fourbar, theta2);
    return st.valid ? [st.O2, st.O4, st.A, st.B, st.P] : [st.O2, st.O4];
  }
  const st = analyzeSliderCrank(g.slider, theta2);
  return st.valid ? [st.O2, st.A, st.B] : [st.O2];
}

export interface Extent {
  min: Vec2;
  max: Vec2;
  center: Vec2;
  width: number;
  height: number;
}

export function extentOf(points: Vec2[]): Extent {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!isFinite(minX)) {
    const zero = { x: 0, y: 0 };
    return { min: zero, max: zero, center: zero, width: 0, height: 0 };
  }
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function mechanismExtent(g: MechanismGeometry, steps = SWEEP_STEPS): Extent {
  return extentOf(mechanismPoints(g, steps));
}

/**
 * A single string that changes exactly when the fitted box would. The views key their refit off
 * this rather than off the state objects: those are replaced on every patch (including θ₂, which
 * ticks 60 times a second while playing and moves nothing the fit depends on).
 */
export function geometryKey(g: MechanismGeometry): string {
  const f = g.fourbar;
  const s = g.slider;
  return g.kind === "fourbar"
    ? `4:${f.ground},${f.input},${f.coupler},${f.output},${f.couplerPointDist},${f.couplerPointAngle},${f.circuit}`
    : `s:${s.crank},${s.rod},${s.offset}`;
}
