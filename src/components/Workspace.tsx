// The central CAD canvas: draws the mechanism, animates it, and lets you drag joints to edit
// link lengths (the numbers come straight back from the engine on every frame).
//
// The view is two layers (see [view.ts](../render/view.ts)): an AUTO-FIT that keeps the whole
// mechanism inside the container — recomputed whenever the geometry or the container changes, and
// again if a pose ever escapes the frame — and a MANUAL zoom/pan on top of it. Once the user
// scrolls, pinches or drags the background, that manual layer is theirs: the auto-fit still tracks
// the container underneath it (so a resize never strands the drawing) but nothing resets their zoom
// except the Fit control or a double-click.

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import {
  analyzeFourBar,
  analyzeSliderCrank,
  couplerCurve,
  type FourBarLinkage,
  type SliderCrankLinkage,
  type Vec2,
} from "../engine";
import {
  clear,
  drawCouplerCurve,
  drawFourBar,
  drawGrid,
  drawSliderCrank,
  hitTest,
  type Handle,
} from "../render/draw";
import {
  composeView,
  FIT,
  fitView,
  isFit,
  panAdjust,
  pointsFit,
  screenToWorld,
  zoomAdjust,
  type View,
  type ViewAdjust,
} from "../render/view";
import { geometryKey, mechanismPoints, posePoints } from "../render/extent";
import { getPalette } from "../render/palette";
import type { WorkspaceState } from "../state";
import { Button } from "./ui";

interface Props {
  state: WorkspaceState;
  onPatchFourBar: (p: Partial<FourBarLinkage>) => void;
  onPatchSlider: (p: Partial<SliderCrankLinkage>) => void;
  onSetTheta2: (t: number) => void;
}

export default function Workspace({
  state,
  onPatchFourBar,
  onPatchSlider,
  onSetTheta2,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The auto-fit. Always tracks the geometry and the container. */
  const baseRef = useRef<View | null>(null);
  /** The user's zoom/pan on top of it. */
  const adjustRef = useRef<ViewAdjust>(FIT);
  /** The two composed — what the drawing and every hit test read. */
  const viewRef = useRef<View | null>(null);
  const handlesRef = useRef<Handle[]>([]);
  const dragRef = useRef<Handle["id"] | null>(null);
  // Live pointers, by id: one is a handle drag or a pan, two are a pinch.
  const pointersRef = useRef(new Map<number, Vec2>());
  const panRef = useRef<Vec2 | null>(null);
  const pinchRef = useRef<{ dist: number; mid: Vec2 } | null>(null);
  // Mirrors `adjustRef` into render state, for the Fit button only.
  const [adjusted, setAdjusted] = useState(false);
  // keep latest state in a ref so the rAF loop always reads fresh values
  const stateRef = useRef(state);
  stateRef.current = state;

  const recompose = () => {
    const cv = canvasRef.current;
    const base = baseRef.current;
    if (!cv || !base) return;
    viewRef.current = composeView(base, adjustRef.current, cv.clientWidth, cv.clientHeight);
  };

  const setAdjust = (a: ViewAdjust) => {
    adjustRef.current = a;
    setAdjusted(!isFit(a));
    recompose();
  };

  /**
   * Recompute the auto-fit from the mechanism's FULL cycle, not the pose on screen. `extra` lets a
   * caller force specific points into the box — the containment guard passes the pose that escaped.
   */
  const refit = (extra: Vec2[] = []) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const s = stateRef.current;
    baseRef.current = fitView(
      [...mechanismPoints(s), ...posePoints(s, s.theta2), ...extra],
      cv.clientWidth,
      cv.clientHeight,
    );
    recompose();
  };

  const resetFit = () => {
    setAdjust(FIT);
    refit();
  };

  // Refit whenever the fitted box could have changed: the mechanism type, any dimension, or the
  // container. `geometryKey` is what makes this affordable — the state objects are replaced on every
  // patch including θ₂, which ticks 60×/s while playing and moves nothing the fit depends on.
  const fitKey = geometryKey(state);
  useEffect(() => {
    refit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => refit());
    ro.observe(cv);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom. React routes `onWheel` through a PASSIVE listener on the root, where
  // `preventDefault()` is a no-op and the page scrolls behind the zoom — so this one is attached
  // directly, non-passive, and cannot be moved onto the JSX.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      const base = baseRef.current;
      if (!base) return;
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      // deltaMode 1 is DOM_DELTA_LINE (Firefox, and any mouse reporting lines): ~16px per line.
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setAdjust(
        zoomAdjust(
          base,
          adjustRef.current,
          cv.clientWidth,
          cv.clientHeight,
          e.clientX - rect.left,
          e.clientY - rect.top,
          Math.exp(-dy * 0.0015),
        ),
      );
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation + render loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const cv = canvasRef.current;
      const s = stateRef.current;
      // Skip the frame until the canvas has a real size. A just-mounted or just-shown canvas can
      // measure 0×0 for a frame or two (a pane switching from display:none, layout not settled);
      // sizing the backing store to 0 and fitting to a 0-wide box both feed the degenerate-view
      // path. The ResizeObserver refits the instant a real size lands.
      if (cv && viewRef.current && cv.clientWidth > 0 && cv.clientHeight > 0) {
        // size to device pixels
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth;
        const h = cv.clientHeight;
        if (cv.width !== w * dpr || cv.height !== h * dpr) {
          cv.width = w * dpr;
          cv.height = h * dpr;
        }
        const ctx = cv.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pal = getPalette();

        // advance angle if playing and not dragging
        if (s.playing && !dragRef.current) {
          const next = s.theta2 + s.omega2 * s.speed * dt * 0.15;
          onSetTheta2(next);
        }

        // The auto-fit's trigger of last resort. Nothing has to change for the drawing to leave the
        // frame: an input link that rocks rather than rotates reaches poses the cycle sweep skips,
        // so the fitted box can be wrong for the pose actually on screen. Cheap — one solve — and
        // only while the view is still the plain auto-fit; once the user has zoomed, the frame is
        // theirs and shoving it back would fight them.
        if (isFit(adjustRef.current) && !dragRef.current && !panRef.current) {
          const pose = posePoints(s, s.theta2);
          if (!pointsFit(pose, viewRef.current, w, h, 2)) refit(pose);
        }

        clear(ctx, w, h, pal);
        if (s.showGrid) drawGrid(ctx, w, h, viewRef.current, pal);

        if (s.kind === "fourbar") {
          if (s.showCouplerCurve)
            drawCouplerCurve(ctx, couplerCurve(s.fourbar, 240), viewRef.current, pal);
          const st = analyzeFourBar(s.fourbar, s.theta2);
          handlesRef.current = drawFourBar(ctx, st, viewRef.current, pal, {
            showHandles: true,
            showLabels: s.showLabels,
          });
        } else {
          const st = analyzeSliderCrank(s.slider, s.theta2);
          handlesRef.current = drawSliderCrank(ctx, st, viewRef.current, pal, {
            showHandles: true,
            showLabels: s.showLabels,
          });
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pointer interaction ────────────────────────────────────────────────
  const localXY = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Distance and midpoint of the first two live pointers — the pinch gesture's whole state. */
  const pinchState = () => {
    const [a, b] = [...pointersRef.current.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = localXY(e);
    pointersRef.current.set(e.pointerId, p);
    canvasRef.current!.setPointerCapture(e.pointerId);

    if (pointersRef.current.size === 2) {
      // Second finger down: whatever the first was doing, this is a pinch now.
      dragRef.current = null;
      panRef.current = null;
      pinchRef.current = pinchState();
      return;
    }
    if (pointersRef.current.size > 2) return;

    const hit = hitTest(handlesRef.current, p.x, p.y);
    if (hit) dragRef.current = hit.id;
    else panRef.current = p; // empty space pans the view, as in any CAD viewport
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    const view = viewRef.current;
    if (!cv || !view) return;
    const p = localXY(e);
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, p);

    // Pinch: zoom about the midpoint and follow it. The canvas is `touch-none`, so the browser is
    // not also scrolling or page-zooming underneath this.
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const prev = pinchRef.current;
      const nowPinch = pinchState();
      const base = baseRef.current;
      if (base) {
        const zoomed = zoomAdjust(
          base,
          adjustRef.current,
          cv.clientWidth,
          cv.clientHeight,
          nowPinch.mid.x,
          nowPinch.mid.y,
          nowPinch.dist / prev.dist,
        );
        setAdjust(panAdjust(zoomed, nowPinch.mid.x - prev.mid.x, nowPinch.mid.y - prev.mid.y));
      }
      pinchRef.current = nowPinch;
      return;
    }

    if (panRef.current) {
      const last = panRef.current;
      setAdjust(panAdjust(adjustRef.current, p.x - last.x, p.y - last.y));
      panRef.current = p;
      return;
    }

    const id = dragRef.current;
    if (!id) return;
    const wp = screenToWorld(p.x, p.y, view);
    const s = stateRef.current;

    if (s.kind === "fourbar") {
      const O4 = { x: s.fourbar.ground, y: 0 };
      switch (id) {
        case "O4":
          onPatchFourBar({ ground: clamp(wp.x, 0.3, 50) });
          break;
        case "A": {
          // grab the crank tip: set crank length AND input angle
          const len = Math.hypot(wp.x, wp.y);
          onPatchFourBar({ input: clamp(len, 0.2, 50) });
          onSetTheta2(Math.atan2(wp.y, wp.x));
          break;
        }
        case "B": {
          const len = Math.hypot(wp.x - O4.x, wp.y - O4.y);
          onPatchFourBar({ output: clamp(len, 0.2, 50) });
          break;
        }
        case "P": {
          // edit coupler point relative to coupler line (A->B)
          const st = analyzeFourBar(s.fourbar, s.theta2);
          if (st.valid) {
            const dx = wp.x - st.A.x;
            const dy = wp.y - st.A.y;
            const dist = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) - st.theta3;
            onPatchFourBar({
              couplerPointDist: clamp(dist, 0, 50),
              couplerPointAngle: angle,
            });
          }
          break;
        }
      }
    } else {
      if (id === "A") {
        const len = Math.hypot(wp.x, wp.y);
        onPatchSlider({ crank: clamp(len, 0.2, 30) });
        onSetTheta2(Math.atan2(wp.y, wp.x));
      }
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    try {
      canvasRef.current!.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      // A finger is still down after a pinch — hand it the pan rather than dropping the gesture,
      // which would otherwise jump the next time it moves.
      panRef.current = [...pointersRef.current.values()][0];
      dragRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      panRef.current = null;
    }
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        id="cad-canvas"
        className="h-full w-full touch-none"
        style={{ cursor: dragRef.current ? "grabbing" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={resetFit}
      />
      <div className="pointer-events-none absolute left-3 top-3 max-w-[85%] text-mini text-faint">
        drag the ◯ handles to edit lengths
        <span className="hidden sm:inline"> · scroll or pinch to zoom · drag the background to pan</span>
        <span className="hidden sm:inline"> · double-click to fit</span>
      </div>
      {adjusted && (
        <Button
          variant="outline"
          title="Fit the mechanism to the view (double-clicking the canvas does the same)"
          onClick={resetFit}
          className="absolute bottom-3 right-3 bg-panel-2/85 backdrop-blur-sm"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </Button>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
