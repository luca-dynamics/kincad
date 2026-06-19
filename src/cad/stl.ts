// Export a built CAD mesh to a binary STL the user can open in any CAD/slicer.

import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";

export function exportSTL(mesh: THREE.Mesh, name = "kincad-model.stl") {
  const exporter = new STLExporter();
  const data = exporter.parse(mesh, { binary: true }) as unknown as DataView;
  const blob = new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
