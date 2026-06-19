// World <-> screen mapping for the CAD canvas.
// World units are the engine's length units (mm by convention). +y is UP in world space
// (engineering convention) but DOWN in canvas space, so the transform flips y.

import type { Vec2 } from "../engine";

export interface View {
  scale: number; // pixels per world unit
  cx: number; // screen pixel that maps to world origin x
  cy: number; // screen pixel that maps to world origin y
}

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
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1e-3);
  const h = Math.max(maxY - minY, 1e-3);
  const scale = Math.min(
    (width - 2 * margin) / w,
    (height - 2 * margin) / h,
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    scale,
    cx: width / 2 - midX * scale,
    cy: height / 2 + midY * scale,
  };
}
