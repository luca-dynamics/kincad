import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { toRad, type FourBarLinkage, type SliderCrankLinkage } from "../../engine";
import { extentOf, fourBarPoints, mechanismExtent, sliderCrankPoints } from "../extent";
import { FOV, frameCamera, frameDistance, VIEW_DIR } from "../frame3d";

/**
 * The 3D counterpart of [view.test.ts](./view.test.ts), and the only check the 3D framing can get:
 * a react-three-fiber `<Canvas>` needs a WebGL context and a live layout, so the camera cannot be
 * observed in a headless run — or in a browser pane that is not compositing, where r3f measures the
 * canvas as 0 × 0 and never creates the scene at all. So the arithmetic is verified the way the eye
 * would verify it: build the real `THREE.PerspectiveCamera` the app creates, place it exactly as
 * `AutoFrame` does, and project the corners of the mechanism's box through it. Anything with
 * |NDC| > 1 is off the edge of the picture.
 */

/** The linkage whose 3D view was hanging off the edge, and a big one to catch a fixed distance. */
const SMALL: FourBarLinkage = {
  ground: 5,
  input: 1.2,
  coupler: 3.5,
  output: 3,
  couplerPointDist: 2.8,
  couplerPointAngle: toRad(50),
  circuit: "open",
};
const BIG: FourBarLinkage = {
  ground: 38,
  input: 9,
  coupler: 26,
  output: 22,
  couplerPointDist: 14,
  couplerPointAngle: toRad(35),
  circuit: "open",
};
const SLIDER: SliderCrankLinkage = { crank: 1.4, rod: 4.5, offset: 0.6};

/** Panel shapes the view actually gets: desktop, half-width dock, phone portrait, and a sliver. */
const ASPECTS: [string, number][] = [
  ["desktop 1440x635", 1440 / 635],
  ["dock 720x480", 720 / 480],
  ["phone 390x520", 390 / 520],
  ["sliver 200x700", 200 / 700],
  // Both extremes matter, and for opposite reasons: in the letterbox the HEIGHT binds and the
  // horizontal closed form would leave the camera far too close; in the sliver the width binds.
  ["letterbox 1920x400", 1920 / 400],
];

/** Worst |x| and |y| in normalised device coordinates over the corners of the box, as framed. */
function worstNDC(extent: ReturnType<typeof extentOf>, aspect: number) {
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 4000);
  const { position, target } = frameCamera(extent, aspect);
  cam.position.set(...position);
  cam.lookAt(new THREE.Vector3(...target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();

  let worstX = 0;
  let worstY = 0;
  let worstZ = 0;
  for (const x of [extent.min.x, extent.center.x, extent.max.x]) {
    for (const y of [extent.min.y, extent.center.y, extent.max.y]) {
      // The mechanism is drawn on z = 0; bars and joints stand ±0.17 out of that plane.
      for (const z of [-0.17, 0, 0.17]) {
        const ndc = new THREE.Vector3(x, y, z).project(cam);
        worstX = Math.max(worstX, Math.abs(ndc.x));
        worstY = Math.max(worstY, Math.abs(ndc.y));
        worstZ = Math.max(worstZ, Math.abs(ndc.z));
      }
    }
  }
  return { worstX, worstY, worstZ };
}

describe("frameCamera — the mechanism is inside the picture", () => {
  it("keeps every corner of the box on screen, at every panel shape", () => {
    for (const [, aspect] of ASPECTS) {
      for (const extent of [
        extentOf(fourBarPoints(SMALL)),
        extentOf(fourBarPoints(BIG)),
        extentOf(sliderCrankPoints(SLIDER)),
      ]) {
        const { worstX, worstY, worstZ } = worstNDC(extent, aspect);
        expect(worstX).toBeLessThanOrEqual(1);
        expect(worstY).toBeLessThanOrEqual(1);
        expect(worstZ).toBeLessThan(1); // inside the near/far clip range too
      }
    }
  });

  it("leaves a margin rather than filling the frame exactly", () => {
    // The 12% pad plus the joint-radius allowance: the drawing should not touch the edge, or the
    // outermost bar sits on the border of the viewport.
    const { worstX, worstY } = worstNDC(extentOf(fourBarPoints(SMALL)), 1440 / 635);
    expect(Math.max(worstX, worstY)).toBeLessThan(0.95);
    expect(Math.max(worstX, worstY)).toBeGreaterThan(0.4); // and not so far out it is a speck
  });

  it("pulls back for a bigger mechanism instead of clipping it", () => {
    // The old camera sat at a fixed [0, -6, 7] whatever the linkage measured — a 38-unit ground
    // link was simply off both edges. The distance now tracks the size of the box.
    const near = frameDistance(mechanismExtent({ kind: "fourbar", fourbar: SMALL, slider: SLIDER }), 2);
    const far = frameDistance(mechanismExtent({ kind: "fourbar", fourbar: BIG, slider: SLIDER }), 2);
    expect(far).toBeGreaterThan(near * 3);
    // Not proportional to the width: which of the two axes binds differs between the two boxes
    // (SMALL is nearly as tall as it is wide, BIG is a long flat linkage), which is the whole
    // reason both axes are solved rather than one assumed.
    expect(far / near).toBeLessThan(extentOf(fourBarPoints(BIG)).width / extentOf(fourBarPoints(SMALL)).width);
  });

  it("pulls back further as the panel narrows", () => {
    const extent = extentOf(fourBarPoints(SMALL));
    const wide = frameDistance(extent, 1440 / 635);
    const portrait = frameDistance(extent, 390 / 520);
    expect(portrait).toBeGreaterThan(wide);
  });

  it("never divides by a zero-size canvas or a zero-size mechanism", () => {
    const empty = extentOf([]);
    expect(frameDistance(empty, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(frameDistance(empty, 0))).toBe(true);
    expect(frameDistance(extentOf(fourBarPoints(SMALL)), 0)).toBeGreaterThan(0);
  });

  it("looks at the middle of the mechanism from the documented direction", () => {
    const extent = extentOf(fourBarPoints(SMALL));
    const { position, target, distance } = frameCamera(extent, 2);
    expect(target).toEqual([extent.center.x, extent.center.y, 0]);
    // Same three-quarter direction as the original hardcoded [0, -6, 7] offset.
    const dir = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    expect(Math.hypot(...dir)).toBeCloseTo(distance, 9);
    expect(dir[0] / distance).toBeCloseTo(VIEW_DIR[0], 9);
    expect(dir[1] / distance).toBeCloseTo(VIEW_DIR[1], 9);
    expect(dir[2] / distance).toBeCloseTo(VIEW_DIR[2], 9);
  });
});
