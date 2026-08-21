// Renders a freeform CAD model (built from the agent's spec) in three.js. One mode of the
// generic Viewport screen, alongside the 2D/3D mechanism views.

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import type { CadModel } from "../../cad/types";
import { buildCad } from "../../cad/build";
import { useTheme } from "../../theme";

export default function CadView({ model }: { model: CadModel }) {
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

  if (!built) {
    return <div className="grid h-full w-full place-items-center text-meta text-bad">Could not build this CAD model.</div>;
  }

  const { mesh, size, center } = built;
  const dist = Math.max(size.x, size.y, size.z, 1) * 2.2;
  const camPos: [number, number, number] = [center.x + dist, center.y + dist * 0.7, center.z + dist];

  return (
    <Canvas shadows camera={{ position: camPos, fov: 45 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
      {/* Mirrors the canvas tokens in index.css by hand — r3f cannot read CSS vars. Kept
          identical to ThreeView's scene colours so switching 3D ↔ CAD does not change the room. */}
      <color attach="background" args={[dark ? "#000000" : "#faf9f5"]} />
      <ambientLight intensity={dark ? 0.55 : 0.85} />
      <directionalLight position={[dist, dist * 1.4, dist]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-dist, dist * 0.5, -dist * 0.5]} intensity={0.35} />

      <primitive object={mesh} />

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
