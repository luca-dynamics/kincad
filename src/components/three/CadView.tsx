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
    return <div className="grid h-full w-full place-items-center text-xs text-bad">Could not build this CAD model.</div>;
  }

  const { mesh, size, center } = built;
  const dist = Math.max(size.x, size.y, size.z, 1) * 2.2;
  const camPos: [number, number, number] = [center.x + dist, center.y + dist * 0.7, center.z + dist];

  return (
    <Canvas shadows camera={{ position: camPos, fov: 45 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[dark ? "#161717" : "#f6f3ea"]} />
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
        cellColor={dark ? "#2a2d2d" : "#dcd6c6"}
        sectionColor={dark ? "#3a3f3f" : "#c8c1ad"}
        fadeDistance={dist * 8}
        infiniteGrid
      />

      <OrbitControls target={[center.x, center.y, center.z]} enableDamping makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewcube
          color={dark ? "#2d2d2d" : "#eae5d7"}
          textColor={dark ? "#e5e5e5" : "#292720"}
          strokeColor={dark ? "#5a5a5a" : "#b8b09a"}
          hoverColor="#a78bfa"
        />
      </GizmoHelper>
    </Canvas>
  );
}
