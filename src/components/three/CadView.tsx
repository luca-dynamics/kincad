// Renders a freeform CAD model (built from the agent's spec) in three.js. One mode of the
// generic Viewport screen, alongside the 2D/3D mechanism views.
//
// THE CLIP RANGE FOLLOWS THE PART, and it has to. Everything here is sized from the model's own
// bounding box, the camera included, so a 600 mm platform is framed from ~2.1 m away — while r3f's
// default camera is near 0.1 / far 1000. The whole solid then sits beyond the far plane and the view
// renders EMPTY: background, grid and view cube gone too, nothing but the gizmo, which draws in its
// own scene. That is what "the CAD model generates blank" was — not a build failure (the part sheet
// and the STL export were fine off the same mesh), just a part larger than a clip range nobody had
// tied to it. `near`/`far` below are derived from the framing distance for that reason, and
// [ThreeView.tsx](ThreeView.tsx) sets its own range for the same one.

import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CadModel } from "../../cad/types";
import { buildCad } from "../../cad/build";
import { useTheme } from "../../theme";
import { fromMm, lenLabel, type LengthUnit } from "../../units";
import Label, { type LabelSpec } from "./Label";

export default function CadView({
  model,
  showLabels,
  unit,
}: {
  model: CadModel;
  /** The toolbar's Dimensions toggle — the same `state.showLabels` the 2D and 3D views read. */
  showLabels: boolean;
  unit: LengthUnit;
}) {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const built = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue("--accent").trim() || "#a78bfa";
    try {
      return buildCad(model.node, accent, model.params);
    } catch (e) {
      console.error("[cad] build failed", e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, theme]);

  // Label ink, mirroring the tokens the rest of the app draws text with. r3f cannot read CSS vars
  // from inside the scene, so like the scene colours below this is resolved out here.
  const ink = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return { text: v("--fg"), frame: v("--c-ground"), halo: v("--canvas-bg") };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // The bounding box as a wireframe, so the three dimensions below have something to measure along.
  // Built here rather than in the JSX because an `EdgesGeometry` per frame is a per-frame allocation
  // the GPU never gets back; the source box is transient and disposed straight away.
  const frame = useMemo(() => {
    if (!built) return null;
    const { size } = built;
    const box = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [built]);
  useEffect(() => () => frame?.dispose(), [frame]);

  if (!built) {
    return <div className="grid h-full w-full place-items-center text-meta text-bad">Could not build this CAD model.</div>;
  }

  const { mesh, size, center } = built;
  const dist = Math.max(size.x, size.y, size.z, 1) * 2.2;
  const camPos: [number, number, number] = [center.x + dist, center.y + dist * 0.7, center.z + dist];
  // Proportional to the part, so one range serves a 5 mm pin and a 2 m frame: `near` stays well
  // inside the nearest face at the framing distance while leaving room to dolly in, and `far` leaves
  // room to dolly out. See the header for what the defaults did instead.
  const near = Math.max(dist / 200, 0.01);
  const far = dist * 20;

  // The part's extents, hung on the three edges that meet at the bottom-front-right corner — the
  // corner facing the default camera, and the one a drawing would dimension from.
  //
  // These convert. The mechanism's unit is a declaration over numbers the scale-free solver never
  // interprets, but a generated part is authored in real millimetres (see `MM_PER` in
  // [units.ts](../../units.ts)), so 600 mm shown in centimetres is 60 cm and not "60 cm" written
  // over a 600.
  const half = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
  const dims: LabelSpec[] = !showLabels
    ? []
    : [
        {
          key: "x",
          text: `X ${lenLabel(fromMm(size.x, unit), unit)}`,
          color: ink.text,
          at: [center.x, center.y - half.y, center.z + half.z],
        },
        {
          key: "y",
          text: `Y ${lenLabel(fromMm(size.y, unit), unit)}`,
          color: ink.text,
          at: [center.x + half.x, center.y, center.z + half.z],
        },
        {
          key: "z",
          text: `Z ${lenLabel(fromMm(size.z, unit), unit)}`,
          color: ink.text,
          at: [center.x + half.x, center.y - half.y, center.z],
        },
      ];

  return (
    <Canvas shadows camera={{ position: camPos, fov: 45, near, far }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
      {/* Mirrors the canvas tokens in index.css by hand — r3f cannot read CSS vars. Kept
          identical to ThreeView's scene colours so switching 3D ↔ CAD does not change the room. */}
      <color attach="background" args={[dark ? "#000000" : "#faf9f5"]} />
      <ambientLight intensity={dark ? 0.55 : 0.85} />
      <directionalLight position={[dist, dist * 1.4, dist]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-dist, dist * 0.5, -dist * 0.5]} intensity={0.35} />

      <primitive object={mesh} />

      {showLabels && frame && (
        <lineSegments position={[center.x, center.y, center.z]} geometry={frame}>
          {/* Depth-tested, unlike the labels: the far edges being hidden by the solid is what makes
              this read as a box around the part rather than a flat outline drawn over it. */}
          <lineBasicMaterial color={ink.frame} transparent opacity={0.6} depthWrite={false} />
        </lineSegments>
      )}
      {dims.map((l) => (
        <Label key={l.key} text={l.text} color={l.color} halo={ink.halo} at={l.at} />
      ))}

      <Grid
        position={[center.x, center.y - size.y / 2 - 0.01, center.z]}
        args={[Math.max(size.x, size.z) * 6, Math.max(size.x, size.z) * 6]}
        cellSize={Math.max(0.5, dist / 20)}
        cellThickness={0.5}
        sectionSize={Math.max(2, dist / 5)}
        cellColor={dark ? "#1f1f1f" : "#e9e5d9"}
        sectionColor={dark ? "#2e2e2e" : "#d4cfc0"}
        fadeDistance={dist * 8}
        infiniteGrid
      />

      <OrbitControls target={[center.x, center.y, center.z]} enableDamping makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewcube
          color={dark ? "#1f1f1f" : "#e7e4d7"}
          textColor={dark ? "#ededed" : "#1f1e1d"}
          strokeColor={dark ? "#4a4a4a" : "#b3aea1"}
          hoverColor="#a78bfa"
        />
      </GizmoHelper>
    </Canvas>
  );
}
