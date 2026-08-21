// Does the CSG builder actually produce the solid it claims to?
//
// The existing builder test asserts only that geometry exists (position.count > 0, size.x > 30).
// That passes for a mesh with the bore missing, for a mesh with the bore not cut through, and for
// an open shell — none of which is a manufacturable part, and all of which would still export to
// STL and still print a plausible-looking part sheet. This file checks the mesh against closed-
// form solid geometry instead:
//
//   * VOLUME by the signed-tetrahedron sum. Only meaningful for a closed surface, and it is
//     compared against the exact volume of the block minus the bore prism — so a bore that does
//     not pierce, or is not there at all, fails by thousands of mm^3.
//   * CLOSURE by the divergence identity: for any closed surface the sum of the outward face-area
//     vectors is zero. Exact for any triangulation, needs no vertex welding, and is independent
//     of the volume check.
//   * SURFACE AREA against the same analytic model, which catches a bore of the wrong depth even
//     when the volume happens to work out.
//
// The bore is built from THREE.CylinderGeometry with 48 radial segments (src/cad/build.ts:38), so
// the truth model is a 48-sided PRISM, not a cylinder. The test asserts that difference explicitly
// — a part sheet that quotes a nominal 8 mm radius is describing a 48-gon, and the discrepancy
// belongs in the record rather than in a rounding error.

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { buildCad } from "../build";
import type { CadNode } from "../types";

// Bearing block: 60 x 12 x 40 mm, bored through the 12 mm thickness with an r = 8 mm hole.
// The bore runs along +Y because that is CylinderGeometry's axis; the cylinder is deliberately
// longer than the block so the cut goes clean through.
const BLOCK = { x: 60, y: 12, z: 40 };
const BORE_R = 8;
const SEGMENTS = 48;

const BEARING_BLOCK: CadNode = {
  type: "difference",
  children: [
    { type: "box", size: [BLOCK.x, BLOCK.y, BLOCK.z] },
    { type: "cylinder", radius: BORE_R, height: BLOCK.y * 2 },
  ],
};

// --- analytic truth model -------------------------------------------------------------------
// Regular n-gon inscribed in radius R: area = (n/2) R^2 sin(2pi/n), perimeter = 2nR sin(pi/n).
const gonArea = (n: number, r: number) => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n);
const gonPerimeter = (n: number, r: number) => 2 * n * r * Math.sin(Math.PI / n);

const BORE_AREA = gonArea(SEGMENTS, BORE_R);
const BORE_PERIMETER = gonPerimeter(SEGMENTS, BORE_R);

const SOLID_VOLUME = BLOCK.x * BLOCK.y * BLOCK.z; // uncut block
const EXPECTED_VOLUME = SOLID_VOLUME - BORE_AREA * BLOCK.y;
const IDEAL_BORE_VOLUME = SOLID_VOLUME - Math.PI * BORE_R * BORE_R * BLOCK.y;
const EXPECTED_AREA =
  2 * (BLOCK.x * BLOCK.z - BORE_AREA) + // the two faces the bore pierces
  2 * (BLOCK.x * BLOCK.y) +
  2 * (BLOCK.z * BLOCK.y) +
  BORE_PERIMETER * BLOCK.y; // the bore wall

// --- mesh measurements (no dependency on the builder's own reporting) ------------------------

interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

/** Every triangle of a mesh, in world space, whether the geometry is indexed or not. */
function triangles(mesh: THREE.Mesh): Triangle[] {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number) => {
    const j = index ? index.getX(i) : i;
    return new THREE.Vector3(pos.getX(j), pos.getY(j), pos.getZ(j)).applyMatrix4(mesh.matrixWorld);
  };
  const out: Triangle[] = [];
  for (let i = 0; i < count; i += 3) out.push({ a: at(i), b: at(i + 1), c: at(i + 2) });
  return out;
}

/** Signed volume by the divergence theorem: sum of a.(b x c)/6 over all triangles. */
function signedVolume(tris: Triangle[]): number {
  let v = 0;
  const cross = new THREE.Vector3();
  for (const t of tris) v += cross.copy(t.b).cross(t.c).dot(t.a) / 6;
  return v;
}

function surfaceArea(tris: Triangle[]): number {
  let s = 0;
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (const t of tris) s += ab.subVectors(t.b, t.a).cross(ac.subVectors(t.c, t.a)).length() / 2;
  return s;
}

/**
 * Net face-area vector. Zero (to round-off) if and only if the surface is closed: every interior
 * edge is cancelled by its neighbour, so anything left over is a hole.
 */
function netAreaVector(tris: Triangle[]): number {
  const sum = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (const t of tris) {
    sum.addScaledVector(ab.subVectors(t.b, t.a).cross(ac.subVectors(t.c, t.a)), 0.5);
  }
  return sum.length();
}

describe("CAD mesh is a valid solid, not just non-empty geometry", () => {
  const { mesh, size } = buildCad(BEARING_BLOCK);
  const tris = triangles(mesh);
  const volume = Math.abs(signedVolume(tris));
  const area = surfaceArea(tris);

  it("logs the measured figures for the Chapter 4 record", () => {
    // Printed so the numbers quoted in docs/chapter4-validation.md can be regenerated by running
    // the suite, rather than being copied from a transcript.
    console.log(`\nCAD solid validation — bearing block 60 x 12 x 40 mm, r = 8 mm through bore`);
    console.log(`  Triangles           : ${tris.length}`);
    console.log(`  Volume (measured)   : ${volume.toFixed(4)} mm³`);
    console.log(`  Volume (analytic)   : ${EXPECTED_VOLUME.toFixed(4)} mm³   (block − 48-gon prism)`);
    console.log(`  Volume error        : ${(Math.abs(volume - EXPECTED_VOLUME) / EXPECTED_VOLUME).toExponential(2)} relative`);
    console.log(`  Surface area        : ${area.toFixed(4)} mm²   (analytic ${EXPECTED_AREA.toFixed(4)} mm²)`);
    console.log(`  Closure residual    : ${(netAreaVector(tris) / area).toExponential(2)} relative`);
    console.log(`  Bounding box        : ${size.x.toFixed(4)} x ${size.y.toFixed(4)} x ${size.z.toFixed(4)} mm`);
    console.log(`  Faceting vs r=8 mm  : ${(volume - IDEAL_BORE_VOLUME).toFixed(4)} mm³ of material the 48-gon leaves behind`);
    expect(tris.length).toBeGreaterThan(0);
  });

  it("is watertight — the net face-area vector vanishes", () => {
    // Scale-free: compare the leftover against the total area, not against 1 mm^2. The floor is
    // set by float32 position storage (eps ~ 1.2e-7 on coordinates up to 30 mm), so the residual
    // bottoms out around 4e-9 rather than at zero — measured, not assumed.
    expect(netAreaVector(tris) / area).toBeLessThan(1e-7);
  });

  it("...and that closure check would fail if a single triangle were missing", () => {
    // Negative control. Without this, a closure test that always passes is indistinguishable from
    // a closure test that cannot fail. Removing one triangle leaves a hole whose area-vector
    // residual is four orders of magnitude above the tolerance above.
    const holed = tris.slice(1);
    expect(netAreaVector(holed) / surfaceArea(holed)).toBeGreaterThan(1e-4);
  });

  it("has the volume of the block minus the bore prism", () => {
    expect(volume).toBeCloseTo(EXPECTED_VOLUME, 2); // 26394.14 mm^3
    expect(Math.abs(volume - EXPECTED_VOLUME) / EXPECTED_VOLUME).toBeLessThan(1e-6);
  });

  it("proves the bore is cut clean through, not merely present", () => {
    // A missing or blind bore lands within a few hundred mm^3 of the solid block; a through bore
    // removes 2405.9 mm^3. This is the assertion the old `pos.count > 0` test could not make.
    expect(SOLID_VOLUME - volume).toBeCloseTo(BORE_AREA * BLOCK.y, 2);
    expect(volume).toBeLessThan(SOLID_VOLUME - 2000);
  });

  it("is a 48-sided prism, not a true cylinder — and the gap is exactly the faceting", () => {
    // The faceted bore removes LESS material than a nominal r = 8 cylinder would, by the area
    // between the circle and its inscribed 48-gon. Quoting "r = 8 mm" on a part sheet is a
    // nominal dimension; this is the size of the approximation behind it.
    expect(volume).toBeGreaterThan(IDEAL_BORE_VOLUME);
    expect(volume - IDEAL_BORE_VOLUME).toBeCloseTo(
      (Math.PI * BORE_R * BORE_R - BORE_AREA) * BLOCK.y, // 6.87 mm^3
      2,
    );
  });

  it("has the analytic surface area", () => {
    expect(area).toBeCloseTo(EXPECTED_AREA, 2); // 7401.78 mm^2
  });

  it("reports a bounding box equal to the block's outer dimensions", () => {
    expect(size.x).toBeCloseTo(BLOCK.x, 4);
    expect(size.y).toBeCloseTo(BLOCK.y, 4);
    expect(size.z).toBeCloseTo(BLOCK.z, 4);
  });

  it("triangulates into a mesh of usable size", () => {
    expect(tris.length).toBeGreaterThan(100);
    // Every triangle has real area — degenerate slivers are a common CSG failure and they break
    // downstream slicers even though the volume still comes out right.
    for (const t of tris) {
      const ab = new THREE.Vector3().subVectors(t.b, t.a);
      const ac = new THREE.Vector3().subVectors(t.c, t.a);
      expect(ab.cross(ac).length() / 2).toBeGreaterThan(0);
    }
  });
});

describe("CAD mesh validation catches a bore that does not pierce", () => {
  it("a blind pocket has a different volume and is still closed", () => {
    // Same block, but the bore is only half the thickness and offset so it stops inside: the
    // volume must land between the solid block and the through-bored part. This is the negative
    // control for the test above — it shows the volume assertion can actually fail.
    const blind: CadNode = {
      type: "difference",
      children: [
        { type: "box", size: [BLOCK.x, BLOCK.y, BLOCK.z] },
        {
          type: "cylinder",
          radius: BORE_R,
          height: BLOCK.y,
          transform: { translate: [0, BLOCK.y / 2, 0] },
        },
      ],
    };
    const tris = triangles(buildCad(blind).mesh);
    const volume = Math.abs(signedVolume(tris));

    expect(netAreaVector(tris) / surfaceArea(tris)).toBeLessThan(1e-7);
    // Half the bore depth removes half the material.
    expect(SOLID_VOLUME - volume).toBeCloseTo((BORE_AREA * BLOCK.y) / 2, 2);
    expect(volume).toBeGreaterThan(EXPECTED_VOLUME);
    expect(volume).toBeLessThan(SOLID_VOLUME);
  });
});
