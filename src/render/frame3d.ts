// Where to put the 3D camera so a mechanism fits the panel it is drawn in.
//
// This is the 3D counterpart of `fitView` ([view.ts](./view.ts)): same input (the world box from
// [extent.ts](./extent.ts)), same job (contain it whatever the container's shape), different output
// — a camera position instead of a 2D transform. It lives in its own module, free of `three` and of
// react-three-fiber, for one reason: the `<Canvas>` cannot be mounted in a headless run, so a
// formula left inline in the component is a formula nothing can check. Here it is a pure function
// with a projection test behind it ([frame3d.test.ts](./__tests__/frame3d.test.ts)).
//
// The distance is SOLVED, not estimated. The textbook `half-height / tan(fov/2)` assumes the box
// lies flat at one distance, square to the camera. This camera looks at the mechanism plane
// obliquely, so the near edge of the box is closer than its centre and perspective magnifies it —
// enough to push a wide linkage past the edge of the frame even though the closed form said it fit.
// So `frameDistance` projects the corners of the box itself and pushes the camera back until the
// worst of them is inside.

import type { Extent } from "./extent";

type V3 = readonly [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: V3): V3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

/** Unit vector the camera sits along, looking back at the target: a low three-quarter view. */
export const VIEW_DIR: V3 = unit([0, -6, 7]);

/** The camera's up vector — three.js's default, which nothing in the app changes. */
export const UP: V3 = [0, 1, 0];

/** Field of view (degrees) the 3D canvas is created with — the camera prop and this must agree. */
export const FOV = 45;

/**
 * The camera basis `Object3D.lookAt` builds: `z` away from the target, `x` to the right, `y` up.
 * Constant, because the view direction is.
 */
const AXIS_Z: V3 = VIEW_DIR;
const AXIS_X: V3 = unit(cross(UP, AXIS_Z));
const AXIS_Y: V3 = cross(AXIS_Z, AXIS_X);

/** Half a bar thickness plus a joint radius, so the mesh does not graze the edge of the frame. */
const MARGIN = 0.3;
/** Smallest box worth framing: a degenerate linkage would otherwise pull the camera onto its face. */
const MIN_SPAN = 0.5;
/** Breathing room around the solved fit, so the drawing does not sit on the viewport border. */
const PAD = 1.12;
/** Narrowest aspect entertained — a canvas mid-layout reports zero width. */
const MIN_ASPECT = 0.2;

export interface Framing {
  /** Where to look. */
  target: [number, number, number];
  /** Where to look from. */
  position: [number, number, number];
  distance: number;
}

/** The eight corners of the mechanism's box, inflated by `MARGIN`, relative to its centre. */
function cornersAboutCentre(extent: Extent): V3[] {
  const hw = Math.max(extent.width, MIN_SPAN) / 2 + MARGIN;
  const hh = Math.max(extent.height, MIN_SPAN) / 2 + MARGIN;
  const out: V3[] = [];
  for (const x of [-hw, hw]) for (const y of [-hh, hh]) for (const z of [-MARGIN, MARGIN]) out.push([x, y, z]);
  return out;
}

/**
 * How far past the edge of the frame the worst corner falls, as a multiple of half the viewport:
 * 1 is exactly on the border, above 1 is off screen. Mirrors what `Vector3.project` computes —
 * `x_cam / (depth · tan(fov/2) · aspect)` — for a camera `d` along `VIEW_DIR` from the centre.
 */
function worstEdgeRatio(corners: V3[], d: number, tanV: number, aspect: number): number {
  let worst = 0;
  for (const c of corners) {
    // Camera sits at centre + d·z, so the corner relative to the camera is c - d·z.
    const v: V3 = [c[0] - d * AXIS_Z[0], c[1] - d * AXIS_Z[1], c[2] - d * AXIS_Z[2]];
    const depth = -dot(v, AXIS_Z);
    if (depth <= 1e-6) return Infinity; // behind the camera: any distance is better than this
    worst = Math.max(
      worst,
      Math.abs(dot(v, AXIS_X)) / (depth * tanV * aspect),
      Math.abs(dot(v, AXIS_Y)) / (depth * tanV),
    );
  }
  return worst;
}

/**
 * Distance at which the whole box is on screen for this `aspect` and `fov`, with `PAD` to spare.
 * Starts from the flat closed form and corrects: the ratio falls monotonically as the camera
 * retreats, so scaling the distance by the current overshoot converges in a handful of passes.
 */
export function frameDistance(extent: Extent, aspect: number, fov = FOV): number {
  const a = Math.max(aspect, MIN_ASPECT);
  const tanV = Math.tan((fov * Math.PI) / 360);
  const corners = cornersAboutCentre(extent);
  const hw = Math.max(extent.width, MIN_SPAN) / 2 + MARGIN;
  const hh = Math.max(extent.height, MIN_SPAN) / 2 + MARGIN;

  let d = Math.max(hh / tanV, hw / (tanV * a), 1);
  for (let i = 0; i < 24; i++) {
    const r = worstEdgeRatio(corners, d, tanV, a);
    if (!isFinite(r)) {
      d *= 2;
      continue;
    }
    if (Math.abs(r - 1) < 1e-4) break;
    d = Math.max(d * r, MIN_SPAN);
  }
  return Math.max(d, 1) * PAD;
}

/** The whole camera placement: centre of the mechanism, and a point `frameDistance` away along `VIEW_DIR`. */
export function frameCamera(extent: Extent, aspect: number, fov = FOV): Framing {
  const distance = frameDistance(extent, aspect, fov);
  const target: [number, number, number] = [extent.center.x, extent.center.y, 0];
  return {
    target,
    position: [
      target[0] + VIEW_DIR[0] * distance,
      target[1] + VIEW_DIR[1] * distance,
      target[2] + VIEW_DIR[2] * distance,
    ],
    distance,
  };
}
