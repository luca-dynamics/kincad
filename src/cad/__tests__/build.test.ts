import { describe, it, expect } from "vitest";
import { buildCad } from "../build";
import { validateCadNode } from "../types";
import type { CadNode } from "../types";

describe("CAD spec validation", () => {
  it("accepts a well-formed tree and rejects malformed nodes", () => {
    const good: CadNode = {
      type: "difference",
      children: [
        { type: "box", size: [40, 10, 40] },
        { type: "cylinder", radius: 3, height: 12 },
      ],
    };
    expect(validateCadNode(good)).toBe(true);
    expect(validateCadNode({ type: "blob" })).toBe(false);
    expect(validateCadNode({ type: "union", children: [] })).toBe(false); // needs children
    expect(validateCadNode(null)).toBe(false);
  });
});

describe("CAD builder (CSG)", () => {
  it("builds a plate-with-hole into a non-empty mesh", () => {
    const node: CadNode = {
      type: "difference",
      children: [
        { type: "box", size: [40, 10, 40] },
        { type: "cylinder", radius: 3, height: 12 },
      ],
    };
    const { mesh, size } = buildCad(node);
    const pos = mesh.geometry.getAttribute("position");
    expect(pos).toBeTruthy();
    expect(pos.count).toBeGreaterThan(0);
    // bounding box should be roughly the plate's 40 x 10 x 40 extent
    expect(size.x).toBeGreaterThan(30);
    expect(size.y).toBeGreaterThan(8);
    expect(size.z).toBeGreaterThan(30);
  });

  it("union of two boxes produces geometry", () => {
    const node: CadNode = {
      type: "union",
      children: [
        { type: "box", size: [10, 10, 10] },
        { type: "box", size: [10, 10, 10], transform: { translate: [8, 0, 0] } },
      ],
    };
    const { mesh, size } = buildCad(node);
    expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(0);
    expect(size.x).toBeGreaterThan(15); // wider than a single box
  });
});
