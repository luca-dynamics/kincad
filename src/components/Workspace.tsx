// The central CAD canvas: draws the mechanism, animates it, and lets you drag joints to edit
// link lengths (the numbers come straight back from the engine on every frame).

import { useEffect, useRef } from "react";
import {
  analyzeFourBar,
  analyzeSliderCrank,
  couplerCurve,
  type FourBarLinkage,
  type SliderCrankLinkage,
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
import { fitView, screenToWorld, type View } from "../render/view";
import { getPalette } from "../render/palette";
import type { WorkspaceState } from "../state";

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
  const viewRef = useRef<View | null>(null);
  const handlesRef = useRef<Handle[]>([]);
  const dragRef = useRef<Handle["id"] | null>(null);
  // keep latest state in a ref so the rAF loop always reads fresh values
  const stateRef = useRef(state);
  stateRef.current = state;

  // Refit the view when the mechanism type changes or on first mount / resize.
  const refit = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const s = stateRef.current;
    if (s.kind === "fourbar") {
      const pts = couplerCurve(s.fourbar, 180);
      const probe = analyzeFourBar(s.fourbar, 0);
      pts.push(probe.O2, probe.O4, probe.A, probe.B);
      viewRef.current = fitView(pts, cv.clientWidth, cv.clientHeight);
    } else {
      const probe0 = analyzeSliderCrank(s.slider, 0);
      const probe180 = analyzeSliderCrank(s.slider, Math.PI);
      viewRef.current = fitView(
        [probe0.O2, probe0.A, probe0.B, probe180.A, probe180.B],
        cv.clientWidth,
        cv.clientHeight,
      );
    }
  };

  useEffect(() => {
    refit();
    const ro = new ResizeObserver(refit);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  // Animation + render loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const cv = canvasRef.current;
      const s = stateRef.current;
      if (cv && viewRef.current) {
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

        clear(ctx, w, h, pal);
        if (s.showGrid) drawGrid(ctx, w, h, viewRef.current, pal);

        if (s.kind === "fourbar") {
          if (s.showCouplerCurve)
            drawCouplerCurve(ctx, couplerCurve(s.fourbar, 240), viewRef.current, pal);
          const st = analyzeFourBar(s.fourbar, s.theta2);
          handlesRef.current = drawFourBar(ctx, st, viewRef.current, pal, {
            showHandles: true,
          });
        } else {
          const st = analyzeSliderCrank(s.slider, s.theta2);
          handlesRef.current = drawSliderCrank(ctx, st, viewRef.current, pal, {
            showHandles: true,
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

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = localXY(e);
    const hit = hitTest(handlesRef.current, x, y);
    if (hit) {
      dragRef.current = hit.id;
      canvasRef.current!.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const id = dragRef.current;
    if (!id || !viewRef.current) return;
    const { x, y } = localXY(e);
    const wp = screenToWorld(x, y, viewRef.current);
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
    if (dragRef.current) {
      dragRef.current = null;
      try {
        canvasRef.current!.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
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
      />
      <div className="pointer-events-none absolute left-3 top-3 text-[11px] text-faint">
        drag the ◯ handles to edit lengths · grid auto-scales
      </div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
