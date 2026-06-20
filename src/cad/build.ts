// Build a three.js solid from a CadNode tree, applying boolean operations via three-bvh-csg.
// Returns a Mesh (a Brush is a Mesh subclass) ready to render and export.

import * as THREE from "three";
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg";
import type { CadNode, CadParam, Dim, Transform } from "./types";

const evaluator = new Evaluator();
evaluator.useGroups = false; // single material per result keeps things simple

const DEG = Math.PI / 180;

/** Resolve a dimension to a number: literals pass through, references look up the param map. */
type DimMap = Map<string, number>;
function resolve(d: Dim, m: DimMap): number {
  if (typeof d === "number") return d;
  const v = m.get(d);
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function applyTransform(obj: THREE.Object3D, t?: Transform) {
  if (!t) return;
  if (t.translate) obj.position.set(t.translate[0], t.translate[1], t.translate[2]);
  if (t.rotate) obj.rotation.set(t.rotate[0] * DEG, t.rotate[1] * DEG, t.rotate[2] * DEG);
  if (t.scale != null) {
    if (typeof t.scale === "number") obj.scale.setScalar(t.scale);
    else obj.scale.set(t.scale[0], t.scale[1], t.scale[2]);
  }
  obj.updateMatrixWorld(true);
}

function leafGeometry(node: CadNode, m: DimMap): THREE.BufferGeometry {
  const r = (d: Dim) => resolve(d, m);
  switch (node.type) {
    case "box":
      return new THREE.BoxGeometry(r(node.size[0]), r(node.size[1]), r(node.size[2]));
    case "cylinder":
      return new THREE.CylinderGeometry(r(node.radius), r(node.radius), r(node.height), node.segments ?? 48);
    case "cone":
      return new THREE.ConeGeometry(r(node.radius), r(node.height), node.segments ?? 48);
    case "sphere":
      return new THREE.SphereGeometry(r(node.radius), 48, 32);
    case "torus":
      return new THREE.TorusGeometry(r(node.radius), r(node.tube), 24, 64);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

const OP = { union: ADDITION, difference: SUBTRACTION, intersection: INTERSECTION } as const;

function buildBrush(node: CadNode, fallbackColor: string, m: DimMap): Brush {
  const color = node.color ?? fallbackColor;

  if (node.type === "union" || node.type === "difference" || node.type === "intersection") {
    const children = node.children.map((c) => buildBrush(c, color, m));
    let result = children[0];
    for (let i = 1; i < children.length; i++) {
      result = evaluator.evaluate(result, children[i], OP[node.type]);
    }
    result.material = new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.6 });
    applyTransform(result, node.transform);
    return result;
  }

  const geo = leafGeometry(node, m);
  const brush = new Brush(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.6 }));
  applyTransform(brush, node.transform);
  brush.updateMatrixWorld(true);
  return brush;
}

export interface BuiltCad {
  mesh: THREE.Mesh;
  size: THREE.Vector3;
  center: THREE.Vector3;
}

/** Build the model. `color` is the default link colour; `params` resolve dimension references. */
export function buildCad(node: CadNode, color = "#a78bfa", params?: CadParam[]): BuiltCad {
  const m: DimMap = new Map((params ?? []).map((p) => [p.key, p.value]));
  const mesh = buildBrush(node, color, m) as unknown as THREE.Mesh;
  mesh.geometry.computeVertexNormals();
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { mesh, size, center };
}
