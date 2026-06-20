// Turn any CAD model into a PARAMETRIC one so its dimensions become editable sliders
// (CADAM-style). Two paths converge here:
//
//   • Semantic   — the agent emitted named params AND a node tree that references them
//                  by key. We trust it as-is.
//   • Auto       — the model has only literal numbers (offline mode, or a model that
//                  ignored the param instruction). We walk the tree, lift every literal
//                  dimension into a named CadParam, and replace it with a reference.
//
// Either way the result is a model whose `params` drive the geometry, so the panel can
// render sliders and editing one rebuilds the part.

import type { CadModel, CadNode, CadParam, Dim, DimVec3 } from "./types";

const MAX_PARAMS = 16; // keep the panel tidy; extra literals stay fixed

/** True if any dimension in the tree is a parameter reference (a string). */
function hasReferences(node: CadNode): boolean {
  switch (node.type) {
    case "box":
      return node.size.some((d) => typeof d === "string");
    case "cylinder":
    case "cone":
      return typeof node.radius === "string" || typeof node.height === "string";
    case "sphere":
      return typeof node.radius === "string";
    case "torus":
      return typeof node.radius === "string" || typeof node.tube === "string";
    default:
      return node.children.some(hasReferences);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function stepFor(mag: number): number {
  if (mag >= 20) return 1;
  if (mag >= 5) return 0.5;
  return 0.1;
}

interface Acc {
  params: CadParam[];
  counts: Record<string, number>;
}

/** Lift one literal dimension into a named param and return its key; pass through references. */
function lift(role: string, d: Dim, acc: Acc): Dim {
  if (typeof d !== "number" || !isFinite(d)) return d; // already a ref, or unusable
  if (acc.params.length >= MAX_PARAMS) return d; // cap reached → leave literal
  const n = (acc.counts[role] = (acc.counts[role] ?? 0) + 1);
  const label = n === 1 ? cap(role) : `${cap(role)} ${n}`;
  const key = label.toLowerCase().replace(/\s+/g, "_");
  const mag = Math.abs(d);
  acc.params.push({
    key,
    label,
    value: d,
    min: round(Math.max(0.1, mag * 0.25)),
    max: round(Math.max(mag * 3, mag + 10)),
    step: stepFor(mag),
    unit: "mm",
  });
  return key;
}

function walk(node: CadNode, acc: Acc): CadNode {
  switch (node.type) {
    case "box":
      return {
        ...node,
        size: [lift("width", node.size[0], acc), lift("height", node.size[1], acc), lift("depth", node.size[2], acc)] as DimVec3,
      };
    case "cylinder":
      return { ...node, radius: lift("radius", node.radius, acc), height: lift("height", node.height, acc) };
    case "cone":
      return { ...node, radius: lift("radius", node.radius, acc), height: lift("height", node.height, acc) };
    case "sphere":
      return { ...node, radius: lift("radius", node.radius, acc) };
    case "torus":
      return { ...node, radius: lift("ring radius", node.radius, acc), tube: lift("tube", node.tube, acc) };
    default:
      return { ...node, children: node.children.map((c) => walk(c, acc)) };
  }
}

/**
 * Guarantee an editable, parametric model. If the agent already supplied params AND the
 * tree references them, trust it; otherwise auto-extract sliders from the literal dimensions.
 */
export function normalizeCadModel(model: CadModel): CadModel {
  if (model.params && model.params.length > 0 && hasReferences(model.node)) return model;
  const acc: Acc = { params: [], counts: {} };
  const node = walk(model.node, acc);
  return { ...model, node, params: acc.params };
}
