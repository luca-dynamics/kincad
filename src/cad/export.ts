// Export a built CAD mesh to the file types the rest of the world can open.
//
// WHAT IS AND IS NOT POSSIBLE HERE. The CAD model is a triangle mesh produced by boolean CSG
// ([build.ts](build.ts)), so every format below is a mesh format. There is no STEP, IGES or native
// part (.sldprt, .ipt) export and there cannot be one from this data: those are boundary
// representations — analytic surfaces with topology — and recovering a B-rep from triangle soup
// needs a geometric kernel this app does not have. Offering a `.step` that is really a renamed mesh
// would be worse than not offering it, because it would fail in the CAD package that opened it.
// three 0.184.0 ships STL, OBJ, GLTF/GLB, PLY, USDZ, DRACO, EXR and KTX2 exporters; these three are
// the ones a mechanical workflow actually consumes.
//
// The exporters are `import()`ed per format, inside `exportMesh`. They are ~40–100 KB each and most
// sessions download at most one, so eager imports would put all of them in the entry chunk. None of
// them ship type declarations (there is no .d.ts anywhere in the three package), so they resolve as
// `any` — hence the casts on each `parse` result.

import type * as THREE from "three";
import { triggerDownload } from "../report/download";

export type MeshFormat = "stl" | "obj" | "glb";

/** The formats offered in the CAD view's export menu, in the order they are listed. */
export const MESH_FORMATS: { id: MeshFormat; label: string; hint: string }[] = [
  { id: "stl", label: "STL", hint: "3D print" },
  { id: "obj", label: "OBJ", hint: "CAD import" },
  { id: "glb", label: "GLB", hint: "viewer" },
];

/**
 * A filename-safe stem from a model name ("Mounting Bracket" → "mounting-bracket"). Shared with the
 * part sheet so a part's mesh and its sheet land in the downloads folder under the same name.
 */
export function modelSlug(name: string): string {
  const slug = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
  return slug || "kincad-model";
}

/** Write `mesh` out as `<model name>.<format>` and hand it to the browser as a download. */
export async function exportMesh(mesh: THREE.Mesh, format: MeshFormat, modelName: string): Promise<void> {
  const name = `${modelSlug(modelName)}.${format}`;

  switch (format) {
    case "stl": {
      const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
      // Binary, not ASCII: a CSG result is routinely 10k+ triangles, where ASCII STL is ~6× larger
      // for the same geometry and no more useful.
      const data = new STLExporter().parse(mesh, { binary: true }) as unknown as DataView;
      triggerDownload(new Blob([data.buffer as ArrayBuffer], { type: "model/stl" }), name);
      return;
    }
    case "obj": {
      const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
      // OBJ carries no material of its own — colour would need a companion .mtl, and a two-file
      // download is worse than a grey mesh for something being imported into a CAD package anyway.
      const text = new OBJExporter().parse(mesh) as string;
      triggerDownload(new Blob([text], { type: "model/obj;charset=utf-8" }), name);
      return;
    }
    case "glb": {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      // The only one of the three that keeps the material, which is why it is the format for
      // viewers and slides rather than for machining.
      const data = (await new GLTFExporter().parseAsync(mesh, { binary: true })) as ArrayBuffer;
      triggerDownload(new Blob([data], { type: "model/gltf-binary" }), name);
      return;
    }
  }
}
