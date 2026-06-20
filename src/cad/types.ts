// Freeform parametric CAD spec. The agent emits a tree of these nodes (as JSON); the builder
// turns them into a real 3D solid via three.js + CSG, renderable and exportable to STL.
// Permissive (MIT) — no GPL OpenSCAD dependency.

export type Vec3 = [number, number, number];

/**
 * A dimension value: either a literal number, or a string that REFERENCES a named
 * parameter (a `CadParam.key`). References let the part stay parametric — edit the
 * parameter in the panel and every dimension that references it rebuilds (CADAM-style).
 */
export type Dim = number | string;
export type DimVec3 = [Dim, Dim, Dim];

/** A named, editable dimension surfaced as a slider in the parameter panel. */
export interface CadParam {
  key: string; // referenced by `Dim` strings in the node tree, e.g. "width"
  label: string; // shown in the panel, e.g. "Width"
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string; // e.g. "mm"
}

export interface Transform {
  /** translation [x, y, z] */
  translate?: Vec3;
  /** rotation in DEGREES [x, y, z] */
  rotate?: Vec3;
  /** uniform scalar or per-axis scale */
  scale?: number | Vec3;
}

interface Base {
  color?: string; // hex, optional
  transform?: Transform;
}

export type CadNode =
  | (Base & { type: "box"; size: DimVec3 })
  | (Base & { type: "cylinder"; radius: Dim; height: Dim; segments?: number })
  | (Base & { type: "cone"; radius: Dim; height: Dim; segments?: number })
  | (Base & { type: "sphere"; radius: Dim })
  | (Base & { type: "torus"; radius: Dim; tube: Dim })
  | (Base & { type: "union"; children: CadNode[] })
  | (Base & { type: "difference"; children: CadNode[] })
  | (Base & { type: "intersection"; children: CadNode[] });

export interface CadModel {
  name: string;
  node: CadNode;
  /** Editable named dimensions. May be absent on legacy/literal models — derive with normalizeCadModel(). */
  params?: CadParam[];
}

export const CAD_NODE_TYPES = [
  "box",
  "cylinder",
  "cone",
  "sphere",
  "torus",
  "union",
  "difference",
  "intersection",
] as const;

/** Light structural validation (used server-side before sending to the client). */
export function validateCadNode(n: unknown, depth = 0): n is CadNode {
  if (depth > 64 || !n || typeof n !== "object") return false;
  const node = n as { type?: string; children?: unknown[] };
  if (!node.type || !(CAD_NODE_TYPES as readonly string[]).includes(node.type)) return false;
  if (["union", "difference", "intersection"].includes(node.type)) {
    return Array.isArray(node.children) && node.children.length > 0 && node.children.every((c) => validateCadNode(c, depth + 1));
  }
  return true;
}
