import { describe, it, expect } from "vitest";
import { buildCad } from "../build";
import { normalizeCadModel } from "../params";
import type { CadModel, CadNode } from "../types";

const PLATE: CadNode = {
  type: "difference",
  children: [
    { type: "box", size: [40, 10, 40] },
    { type: "cylinder", radius: 3, height: 12 },
  ],
};

describe("normalizeCadModel — auto-extract", () => {
  it("lifts literal dimensions into named params and references them", () => {
    const model = normalizeCadModel({ name: "Plate", node: PLATE });
    // box (w/h/d) + cylinder (radius/height) = 5 params
    expect(model.params?.length).toBe(5);
    const keys = model.params!.map((p) => p.key);
    expect(keys).toContain("width");
    expect(keys).toContain("depth");
    // the box dimensions are now references, not literals
    const box = (model.node as Extract<CadNode, { type: "difference" }>).children[0] as Extract<CadNode, { type: "box" }>;
    expect(box.size.every((d) => typeof d === "string")).toBe(true);
    // every param carries sensible bounds
    for (const p of model.params!) {
      expect(p.min!).toBeLessThan(p.value);
      expect(p.max!).toBeGreaterThan(p.value);
    }
  });

  it("builds to the same geometry as the original literal model", () => {
    const literal = buildCad(PLATE);
    const model = normalizeCadModel({ name: "Plate", node: PLATE });
    const param = buildCad(model.node, undefined, model.params);
    expect(param.size.x).toBeCloseTo(literal.size.x, 3);
    expect(param.size.y).toBeCloseTo(literal.size.y, 3);
    expect(param.size.z).toBeCloseTo(literal.size.z, 3);
  });

  it("editing a parameter changes the resulting geometry", () => {
    const model = normalizeCadModel({ name: "Plate", node: PLATE });
    const widthKey = model.params!.find((p) => p.label === "Width")!.key;
    const before = buildCad(model.node, undefined, model.params).size.x;
    const edited = model.params!.map((p) => (p.key === widthKey ? { ...p, value: p.value * 2 } : p));
    const after = buildCad(model.node, undefined, edited).size.x;
    expect(after).toBeGreaterThan(before * 1.8);
  });
});

describe("normalizeCadModel — semantic (agent-supplied)", () => {
  it("trusts a model that already has params AND references", () => {
    const semantic: CadModel = {
      name: "Spacer",
      node: { type: "cylinder", radius: "outer_r", height: "len" },
      params: [
        { key: "outer_r", label: "Outer radius", value: 8, min: 4, max: 20, unit: "mm" },
        { key: "len", label: "Length", value: 30, min: 10, max: 60, unit: "mm" },
      ],
    };
    const out = normalizeCadModel(semantic);
    expect(out).toBe(semantic); // unchanged — returned as-is
    const { size } = buildCad(out.node, undefined, out.params);
    expect(size.y).toBeCloseTo(30, 3); // cylinder height resolves from the "len" param
  });

  it("auto-extracts when params are present but the tree has no references", () => {
    const sloppy: CadModel = {
      name: "Bad",
      node: { type: "box", size: [20, 20, 20] }, // literals, no refs
      params: [{ key: "ghost", label: "Ghost", value: 5 }],
    };
    const out = normalizeCadModel(sloppy);
    const box = out.node as Extract<CadNode, { type: "box" }>;
    expect(box.size.every((d) => typeof d === "string")).toBe(true); // re-parameterized
    expect(out.params!.some((p) => p.key === "ghost")).toBe(false); // ghost param dropped
  });
});
