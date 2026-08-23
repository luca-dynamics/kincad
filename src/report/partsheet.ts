// The CAD view's document: a part sheet for the model on screen.
//
// A kinematic report ([pdf.ts](pdf.ts)) is the wrong document for a CAD part — it describes a
// linkage's motion, and the part has none. Until this existed the CAD view had no report at all
// (the toolbar's primary button became STL, and nothing else reached the export), so the only record
// of a generated part was the mesh file itself.
//
// WHAT MAKES IT A PART SHEET RATHER THAN A SCREENSHOT: the parameter table and the construction
// tree. Together they are enough to rebuild the part — the same standard [pdf.ts](pdf.ts) holds
// itself to, where printing r₁…r₄ without the coupler-point geometry made the reported figure
// unverifiable. A bounding box and a picture would not survive that test; a dimensioned CSG tree
// does. Page layout comes from [doc.ts](doc.ts).

import type { BuiltCad } from "../cad/build";
import { modelSlug } from "../cad/export";
import type { CadModel, CadNode, Dim } from "../cad/types";
import { createSheet } from "./doc";

/** Deepest level of the construction tree printed — below this the sheet stops being readable. */
const MAX_DEPTH = 6;

/** A dimension as it should read on paper: literals rounded, parameter references by name. */
function dim(d: Dim): string {
  return typeof d === "number" ? d.toFixed(2) : d;
}

/** One line per node, indented by depth, naming each solid and its dimensions. */
function treeLines(node: CadNode, depth = 0, out: string[] = []): string[] {
  const pad = "  ".repeat(depth);
  if (depth > MAX_DEPTH) {
    out.push(`${pad}… (nested deeper than this sheet prints)`);
    return out;
  }
  switch (node.type) {
    case "box":
      out.push(`${pad}box        ${dim(node.size[0])} × ${dim(node.size[1])} × ${dim(node.size[2])}`);
      break;
    case "cylinder":
      out.push(`${pad}cylinder   r ${dim(node.radius)}   h ${dim(node.height)}`);
      break;
    case "cone":
      out.push(`${pad}cone       r ${dim(node.radius)}   h ${dim(node.height)}`);
      break;
    case "sphere":
      out.push(`${pad}sphere     r ${dim(node.radius)}`);
      break;
    case "torus":
      out.push(`${pad}torus      ring ${dim(node.radius)}   tube ${dim(node.tube)}`);
      break;
    default:
      out.push(`${pad}${node.type}`);
      for (const child of node.children) treeLines(child, depth + 1, out);
  }
  return out;
}

/** Leaf solids and boolean operations, counted for the summary row. */
function countNodes(node: CadNode): { solids: number; booleans: number } {
  if (node.type === "union" || node.type === "difference" || node.type === "intersection") {
    return node.children.reduce(
      (acc, c) => {
        const n = countNodes(c);
        return { solids: acc.solids + n.solids, booleans: acc.booleans + n.booleans };
      },
      { solids: 0, booleans: 1 },
    );
  }
  return { solids: 1, booleans: 0 };
}

/** Triangles in the built mesh — indexed and non-indexed geometry both occur in CSG output. */
function triangleCount(built: BuiltCad): number {
  const g = built.mesh.geometry;
  const index = g.getIndex();
  if (index) return Math.floor(index.count / 3);
  const pos = g.getAttribute("position");
  return pos ? Math.floor(pos.count / 3) : 0;
}

export function exportPartSheetPDF(model: CadModel, built: BuiltCad, snapshot?: string) {
  const { h2, kv, para, mono, divider, image, footer, save } = createSheet("KINCAD — CAD Part Sheet");

  if (snapshot) image(snapshot);

  const { size } = built;
  const { solids, booleans } = countNodes(model.node);

  h2("Part");
  kv("Name", model.name || "Untitled part");
  kv("Bounding box", `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} mm`);
  kv("Construction", `${solids} solid${solids === 1 ? "" : "s"}, ${booleans} boolean operation${booleans === 1 ? "" : "s"}`);
  kv("Mesh triangles", triangleCount(built).toLocaleString("en-GB"));

  divider();

  // The editable dimensions, with their limits — this is the table that makes the part a part and
  // not a one-off mesh. `normalizeCadModel` guarantees them on every model the app loads, so an
  // empty list here means a hand-built literal model rather than a missing feature.
  const params = model.params ?? [];
  h2("Parameters", params.length ? "as built; range is the adjustable span" : undefined);
  if (params.length) {
    for (const p of params) {
      const unit = p.unit ? ` ${p.unit}` : "";
      const range =
        p.min != null && p.max != null ? `        (${p.min}${unit} – ${p.max}${unit})` : "";
      kv(p.label, `${p.value}${unit}${range}`);
    }
  } else {
    para("This model has fixed literal dimensions; no named parameters were defined.");
  }

  divider();

  // Printed in mono and indented by nesting depth, so the boolean structure is readable as a tree.
  // `mono`, not `formula`: these lines are already aligned into columns by `treeLines`, and only a
  // fixed-width font keeps them aligned. Dimensions that reference a parameter print the parameter's
  // key, which ties each line back to the table above rather than restating an editable number.
  h2("Construction tree", "boolean CSG, dimensions in mm");
  for (const line of treeLines(model.node)) mono(line);

  divider();

  h2("Method");
  para(
    "The solid is evaluated by constructive solid geometry: each leaf primitive is meshed, then the " +
    "union / difference / intersection nodes above it are applied pairwise with three-bvh-csg to " +
    "produce a single closed triangle mesh. Dimensions that reference a parameter are resolved from " +
    "the table above at build time, so editing one rebuilds the part: the geometry shown, the mesh " +
    "exported and the figures on this sheet all come from the same evaluation.",
  );
  para(
    "Exports available for this part: STL (3D printing and slicers), OBJ (mesh import into CAD and " +
    "modelling packages) and GLB (viewers and presentations). STEP and IGES are not offered: they " +
    "are boundary representations, and a CSG triangle mesh cannot be converted to one without a " +
    "geometric kernel.",
  );

  footer(
    "Geometry built by the KINCAD CSG builder (three.js + three-bvh-csg). The AI assistant proposes " +
    "the parametric specification; every dimension printed here is a value the builder actually used.",
  );
  save(`kincad-partsheet-${modelSlug(model.name)}`);
}
