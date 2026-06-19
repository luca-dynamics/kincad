// Freeform parametric CAD spec. The agent emits a tree of these nodes (as JSON); the builder
// turns them into a real 3D solid via three.js + CSG, renderable and exportable to STL.
// Permissive (MIT) — no GPL OpenSCAD dependency.

export type Vec3 = [number, number, number];

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
  | (Base & { type: "box"; size: Vec3 })
  | (Base & { type: "cylinder"; radius: number; height: number; segments?: number })
  | (Base & { type: "cone"; radius: number; height: number; segments?: number })
  | (Base & { type: "sphere"; radius: number })
  | (Base & { type: "torus"; radius: number; tube: number })
  | (Base & { type: "union"; children: CadNode[] })
  | (Base & { type: "difference"; children: CadNode[] })
  | (Base & { type: "intersection"; children: CadNode[] });

export interface CadModel {
  name: string;
  node: CadNode;
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
