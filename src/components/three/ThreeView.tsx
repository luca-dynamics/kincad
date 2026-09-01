// 3D view of the CURRENT mechanism. Same deterministic engine, rendered as extruded bars and
// pin joints with @react-three/fiber. Orbit + view-cube gizmo, CADAM-style. This is one mode
// of the generic Viewport "screen"; the 2D canvas is the other.
//
// The camera FRAMES the mechanism rather than sitting at a fixed distance: the position used to be
// `[center.x, center.y - 6, 7]`, which is correct for a linkage a few units across and leaves a
// 50mm one hanging off both edges. `AutoFrame` below places it from the swept extent
// ([extent.ts](../../render/extent.ts)) and the canvas aspect via
// [frame3d.ts](../../render/frame3d.ts), and re-frames whenever either changes — until the user
// orbits, after which the view is theirs until they press Fit.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, Grid, OrbitControls } from "@react-three/drei";
import { Maximize2 } from "lucide-react";
import * as THREE from "three";
import { analyzeFourBar, analyzeSliderCrank, couplerCurve, dist, type Vec2 } from "../../engine";
import { geometryKey, mechanismExtent, type Extent } from "../../render/extent";
import { FOV, frameCamera } from "../../render/frame3d";
import type { WorkspaceState } from "../../state";
import { useTheme } from "../../theme";
import { lenLabel, type LengthUnit } from "../../units";
import { Button } from "../ui";
import Label, { type LabelSpec } from "./Label";

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

/**
 * `r₃ 3.5 mm` at the midpoint of one link, MEASURED FROM THE POSE exactly as the 2D overlay does
 * (see `dimText` in [draw.ts](../../render/draw.ts)) — one rule for the number in both views, so
 * they cannot disagree about a dimension. z sits on the bars' own centre plane: the sprite draws
 * over the solids regardless of depth, and an offset would only shift where the tag appears to be
 * anchored as the camera orbits around it.
 */
function dimLabel(name: string, a: Vec2, b: Vec2, color: string, unit: LengthUnit): LabelSpec {
  return {
    key: name,
    text: `${name} ${lenLabel(dist(a, b), unit)}`,
    color,
    at: [(a.x + b.x) / 2, (a.y + b.y) / 2, 0],
  };
}

function buildScene(
  state: WorkspaceState,
  c: Colors,
): { bars: Bar[]; joints: Joint[]; curve: Vec2[]; labels: LabelSpec[] } {
  const bars: Bar[] = [];
  const joints: Joint[] = [];
  const labels: LabelSpec[] = [];
  let curve: Vec2[] = [];

  if (state.kind === "fourbar") {
    const st = analyzeFourBar(state.fourbar, state.theta2);
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
    if (state.showLabels) {
      // r₁ spans the two fixed pivots. No bar is drawn for it in 3D — the frame is implied by the
      // pivots at each end — but it is one of the four dimensions that define the linkage and the
      // 2D view labels it, so it is labelled here too rather than being the one r-number missing.
      labels.push(dimLabel("r₁", st.O2, st.O4, c.ground, state.unit));
      if (st.valid) {
        labels.push(dimLabel("r₂", st.O2, st.A, c.link2, state.unit));
        labels.push(dimLabel("r₃", st.A, st.B, c.link3, state.unit));
        labels.push(dimLabel("r₄", st.O4, st.B, c.link4, state.unit));
      }
    }
  } else {
    const st = analyzeSliderCrank(state.slider, state.theta2);
    if (st.valid) {
      bars.push({ a: st.O2, b: st.A, color: c.link2, thickness: 0.16 });
      bars.push({ a: st.A, b: st.B, color: c.link3, thickness: 0.16 });
      joints.push({ p: st.A, color: c.joint, r: 0.13 });
      joints.push({ p: st.B, color: c.link4, r: 0.2 }); // slider pin (block drawn separately)
    }
    joints.push({ p: st.O2, color: c.ground, r: 0.16, fixed: true });
    if (state.showLabels && st.valid) {
      labels.push(dimLabel("r₂", st.O2, st.A, c.link2, state.unit));
      labels.push(dimLabel("r₃", st.A, st.B, c.link3, state.unit));
    }
  }
  return { bars, joints, curve, labels };
}

interface Colors {
  link2: string;
  link3: string;
  link4: string;
  joint: string;
  ground: string;
  couplerPt: string;
  curve: string;
  /** Outline colour behind a label's glyphs: the canvas background, as in the 2D overlay. */
  halo: string;
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

/** Static so r3f never re-applies it over the camera AutoFrame is driving. `near`/`far` are set
 *  here once and left alone: the clip range is generous enough for every framing distance this
 *  computes, and writing to them per-frame is a mutation of a hook-owned object. `fov` is the one
 *  [frame3d.ts](../../render/frame3d.ts) computes against — change them together. */
const CAMERA_INIT = { fov: FOV, near: 0.1, far: 4000, position: [0, -6, 7] as [number, number, number] };

/**
 * Frames the mechanism: distance from the swept extent, the canvas aspect and the fov, so the whole
 * cycle fits however the panel is sized — the arithmetic is in
 * [frame3d.ts](../../render/frame3d.ts), which is testable without a WebGL context. Re-runs on every
 * extent or size change while `enabled`.
 *
 * Lives inside the `<Canvas>` because that is the only place the camera, the canvas size and the
 * default OrbitControls are reachable. `enabled` goes false the moment the user orbits — from then
 * on the camera is theirs, and a geometry edit must not yank it back.
 */
function AutoFrame({ extent, enabled }: { extent: Extent; enabled: boolean }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;

  useLayoutEffect(() => {
    if (!enabled) return;
    const cam = camera as THREE.PerspectiveCamera;
    const { position, target } = frameCamera(
      extent,
      size.width / Math.max(size.height, 1),
      cam.fov,
    );
    const at = new THREE.Vector3(...target);
    cam.position.set(...position);
    cam.lookAt(at);
    if (controls) {
      controls.target.copy(at);
      controls.update();
    }
  }, [camera, controls, enabled, extent, size.width, size.height]);

  return null;
}

/**
 * A 1-2-5 grid step for the span on screen — the same ladder [draw.ts](../../render/draw.ts) climbs
 * for the 2D grid, so the two views agree about what a gridline means. A fixed 0.5 cell turns into
 * noise the moment the mechanism is tens of units across.
 */
function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
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
      halo: v("--canvas-bg"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const { bars, joints, curve, labels } = buildScene(state, colors);
  const dark = theme === "dark";

  // The box to frame: the mechanism over its whole cycle, not the pose on screen. Keyed off the
  // dimensions only — θ₂ ticks 60×/s while playing and moves nothing the extent depends on, and a
  // new object here would re-run the framing effect every frame.
  const fitKey = geometryKey(state);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const extent = useMemo(() => mechanismExtent(state), [fitKey]);

  // Auto-frame until the user orbits, zooms or clicks the view cube — after that the camera is
  // theirs until Fit. `onStart` fires on user input only: our own `controls.update()` does not
  // dispatch it, so re-framing cannot switch this on by itself.
  const [manual, setManual] = useState(false);
  const span = Math.max(extent.width, extent.height, 1);
  const cell = niceStep(span / 12);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows camera={CAMERA_INIT} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        {/* r3f cannot read CSS vars, so these four scene colours mirror the canvas tokens in
            index.css by hand: background = --canvas-bg, the Grid pair ≈ --canvas-grid/--canvas-axis
            lifted a step (three.js draws these as thin fading lines, so the flat token value
            disappears), and the view-cube borrows --panel-2/--fg/--line-strong. Edit them WITH the
            token blocks — nothing checks that they still agree. */}
        <color attach="background" args={[dark ? "#000000" : "#faf9f5"]} />
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
          {labels.map((l) => (
            <Label key={l.key} text={l.text} color={l.color} halo={colors.halo} at={l.at} />
          ))}
        </group>

        <Grid
          position={[extent.center.x, extent.center.y, -0.3]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[span * 4, span * 4]}
          cellSize={cell}
          cellThickness={0.5}
          sectionSize={cell * 5}
          cellColor={dark ? "#1f1f1f" : "#e9e5d9"}
          sectionColor={dark ? "#2e2e2e" : "#d4cfc0"}
          fadeDistance={span * 6 + 20}
          infiniteGrid
        />

        <Ticker state={state} onSetTheta2={onSetTheta2} />
        <AutoFrame extent={extent} enabled={!manual} />
        <OrbitControls enableDamping makeDefault onStart={() => setManual(true)} />
        <GizmoHelper alignment="bottom-right" margin={[64, 64]} onUpdate={() => setManual(true)}>
          <GizmoViewcube
            color={dark ? "#1f1f1f" : "#e7e4d7"}
            textColor={dark ? "#ededed" : "#1f1e1d"}
            strokeColor={dark ? "#4a4a4a" : "#b3aea1"}
            hoverColor="#a78bfa"
          />
        </GizmoHelper>
      </Canvas>
      {manual && (
        <Button
          variant="outline"
          title="Frame the mechanism again"
          onClick={() => setManual(false)}
          className="absolute bottom-3 left-3 bg-panel-2/85 backdrop-blur-sm"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </Button>
      )}
    </div>
  );
}
