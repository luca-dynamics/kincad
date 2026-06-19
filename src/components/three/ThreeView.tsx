// 3D view of the CURRENT mechanism. Same deterministic engine, rendered as extruded bars and
// pin joints with @react-three/fiber. Orbit + view-cube gizmo, CADAM-style. This is one mode
// of the generic Viewport "screen"; the 2D canvas is the other.

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { analyzeFourBar, analyzeSliderCrank, couplerCurve, type Vec2 } from "../../engine";
import type { WorkspaceState } from "../../state";
import { useTheme } from "../../theme";

interface Bar {
  a: Vec2;
  b: Vec2;
  color: string;
  thickness: number;
}
interface Joint {
  p: Vec2;
  color: string;
  r: number;
  fixed?: boolean;
}

function buildScene(state: WorkspaceState, c: Colors): { bars: Bar[]; joints: Joint[]; curve: Vec2[]; center: Vec2 } {
  const bars: Bar[] = [];
  const joints: Joint[] = [];
  let curve: Vec2[] = [];
  let center: Vec2 = { x: 0, y: 0 };

  if (state.kind === "fourbar") {
    const st = analyzeFourBar(state.fourbar, state.theta2);
    center = { x: state.fourbar.ground / 2, y: 0.5 };
    if (state.showCouplerCurve) curve = couplerCurve(state.fourbar, 200);
    if (st.valid) {
      bars.push({ a: st.O2, b: st.A, color: c.link2, thickness: 0.16 });
      bars.push({ a: st.A, b: st.B, color: c.link3, thickness: 0.16 });
      bars.push({ a: st.O4, b: st.B, color: c.link4, thickness: 0.16 });
      bars.push({ a: st.A, b: st.P, color: c.link3, thickness: 0.08 });
      bars.push({ a: st.B, b: st.P, color: c.link3, thickness: 0.08 });
      joints.push({ p: st.A, color: c.joint, r: 0.13 });
      joints.push({ p: st.B, color: c.joint, r: 0.13 });
      joints.push({ p: st.P, color: c.couplerPt, r: 0.12 });
    }
    joints.push({ p: st.O2, color: c.ground, r: 0.16, fixed: true });
    joints.push({ p: st.O4, color: c.ground, r: 0.16, fixed: true });
  } else {
    const st = analyzeSliderCrank(state.slider, state.theta2);
    center = { x: state.slider.rod * 0.6, y: state.slider.offset / 2 };
    if (st.valid) {
      bars.push({ a: st.O2, b: st.A, color: c.link2, thickness: 0.16 });
      bars.push({ a: st.A, b: st.B, color: c.link3, thickness: 0.16 });
      joints.push({ p: st.A, color: c.joint, r: 0.13 });
      joints.push({ p: st.B, color: c.link4, r: 0.2 }); // slider pin (block drawn separately)
    }
    joints.push({ p: st.O2, color: c.ground, r: 0.16, fixed: true });
  }
  return { bars, joints, curve, center };
}

interface Colors {
  link2: string;
  link3: string;
  link4: string;
  joint: string;
  ground: string;
  couplerPt: string;
  curve: string;
}

function BarMesh({ bar }: { bar: Bar }) {
  const dx = bar.b.x - bar.a.x;
  const dy = bar.b.y - bar.a.y;
  const len = Math.hypot(dx, dy) || 1e-3;
  const angle = Math.atan2(dy, dx);
  return (
    <mesh position={[(bar.a.x + bar.b.x) / 2, (bar.a.y + bar.b.y) / 2, 0]} rotation={[0, 0, angle]} castShadow>
      <boxGeometry args={[len, bar.thickness, bar.thickness]} />
      <meshStandardMaterial color={bar.color} metalness={0.3} roughness={0.5} />
    </mesh>
  );
}

function JointMesh({ joint }: { joint: Joint }) {
  return (
    <mesh position={[joint.p.x, joint.p.y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[joint.r, joint.r, joint.fixed ? 0.34 : 0.26, 24]} />
      <meshStandardMaterial color={joint.color} metalness={0.4} roughness={0.4} />
    </mesh>
  );
}

/** Advances the input angle when playing (this mode's animation clock). */
function Ticker({ state, onSetTheta2 }: { state: WorkspaceState; onSetTheta2: (t: number) => void }) {
  const ref = useRef(state);
  ref.current = state;
  useFrame((_, dt) => {
    const s = ref.current;
    if (s.playing) onSetTheta2(s.theta2 + s.omega2 * s.speed * Math.min(dt, 0.05) * 0.15);
  });
  return null;
}

function CouplerLine({ curve, color }: { curve: Vec2[]; color: string }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts = curve.map((p) => new THREE.Vector3(p.x, p.y, 0));
    if (pts.length) pts.push(pts[0].clone());
    g.setFromPoints(pts);
    return g;
  }, [curve]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <primitive object={new THREE.Line(geom, new THREE.LineBasicMaterial({ color }))} />;
}

export default function ThreeView({
  state,
  onSetTheta2,
}: {
  state: WorkspaceState;
  onSetTheta2: (t: number) => void;
}) {
  const { theme } = useTheme();
  const colors: Colors = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    return {
      link2: v("--c-link2"),
      link3: v("--c-link3"),
      link4: v("--c-link4"),
      joint: v("--c-joint"),
      ground: v("--c-ground"),
      couplerPt: v("--c-coupler-pt"),
      curve: v("--c-curve"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const { bars, joints, curve, center } = buildScene(state, colors);
  const dark = theme === "dark";

  return (
    <Canvas shadows camera={{ position: [center.x, center.y - 6, 7], fov: 45 }} dpr={[1, 2]}>
      <color attach="background" args={[dark ? "#161717" : "#f7f7f6"]} />
      <ambientLight intensity={dark ? 0.5 : 0.8} />
      <directionalLight position={[4, 6, 8]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-5, -3, 4]} intensity={0.3} />

      <group>
        {bars.map((b, i) => (
          <BarMesh key={i} bar={b} />
        ))}
        {joints.map((j, i) => (
          <JointMesh key={i} joint={j} />
        ))}
        {curve.length > 1 && <CouplerLine curve={curve} color={colors.curve} />}
      </group>

      <Grid
        position={[center.x, center.y, -0.3]}
        rotation={[Math.PI / 2, 0, 0]}
        args={[30, 30]}
        cellSize={0.5}
        cellThickness={0.5}
        sectionSize={2}
        cellColor={dark ? "#2a2d2d" : "#dcdcd9"}
        sectionColor={dark ? "#3a3f3f" : "#c4c4c0"}
        fadeDistance={28}
        infiniteGrid
      />

      <Ticker state={state} onSetTheta2={onSetTheta2} />
      <OrbitControls target={[center.x, center.y, 0]} enableDamping makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewcube
          color={dark ? "#2d2d2d" : "#e5e5e3"}
          textColor={dark ? "#e5e5e5" : "#1b1c1c"}
          strokeColor={dark ? "#5a5a5a" : "#adadad"}
          hoverColor="#a78bfa"
        />
      </GizmoHelper>
    </Canvas>
  );
}
