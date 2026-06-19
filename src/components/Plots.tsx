// Bottom engineering plots: output kinematics vs input angle over a full cycle.
// Titles + legends live in an HTML header above each canvas so nothing overlaps the curves.

import { useEffect, useRef } from "react";
import { analyzeFourBar, analyzeSliderCrank, toDeg } from "../engine";
import { drawPlot, type Series } from "../render/plot";
import { getPalette } from "../render/palette";
import { useTheme } from "../theme";
import type { WorkspaceState } from "../state";

interface Props {
  state: WorkspaceState;
}

const STEPS = 360;
type Which = "angle" | "omega" | "alpha";

export default function Plots({ state }: Props) {
  const { theme } = useTheme(); // re-render on theme change
  void theme;
  const four = state.kind === "fourbar";
  return (
    <div className="grid grid-cols-3 gap-px bg-line">
      <PlotCanvas state={state} which="angle" title={four ? "Output angle vs θ₂" : "Slider position vs θ₂"} unit={four ? "deg" : "x"} />
      <PlotCanvas state={state} which="omega" title={four ? "Angular velocity vs θ₂" : "Slider velocity vs θ₂"} unit={four ? "rad/s" : "v"} />
      <PlotCanvas state={state} which="alpha" title={four ? "Angular acceleration vs θ₂" : "Slider acceleration vs θ₂"} unit={four ? "rad/s²" : "a"} />
    </div>
  );
}

function PlotCanvas({ state, which, title, unit }: { state: WorkspaceState; which: Which; title: string; unit: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pal = getPalette();

  // legend entries (label + colour) match the plotted series
  const legend: { label: string; color: string }[] =
    state.kind === "fourbar"
      ? which === "angle"
        ? [{ label: "θ₃", color: pal.link3 }, { label: "θ₄", color: pal.link4 }]
        : which === "omega"
          ? [{ label: "ω₃", color: pal.link3 }, { label: "ω₄", color: pal.link4 }]
          : [{ label: "α₃", color: pal.link3 }, { label: "α₄", color: pal.link4 }]
      : [{ label: which === "angle" ? "x" : which === "omega" ? "v" : "a", color: pal.accent }];

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth,
      h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const series: Series[] = [];
    if (state.kind === "fourbar") {
      const t3: number[] = [], t4: number[] = [], w3: number[] = [], w4: number[] = [], a3: number[] = [], a4: number[] = [];
      for (let i = 0; i < STEPS; i++) {
        const st = analyzeFourBar(state.fourbar, (2 * Math.PI * i) / STEPS, state.omega2);
        const ok = st.valid;
        t3.push(ok ? norm(toDeg(st.theta3)) : NaN);
        t4.push(ok ? norm(toDeg(st.theta4)) : NaN);
        w3.push(ok ? st.omega3 : NaN);
        w4.push(ok ? st.omega4 : NaN);
        a3.push(ok ? st.alpha3 : NaN);
        a4.push(ok ? st.alpha4 : NaN);
      }
      if (which === "angle") {
        series.push({ label: "θ₃", color: pal.link3, data: t3 }, { label: "θ₄", color: pal.link4, data: t4 });
      } else if (which === "omega") {
        series.push({ label: "ω₃", color: pal.link3, data: w3 }, { label: "ω₄", color: pal.link4, data: w4 });
      } else {
        series.push({ label: "α₃", color: pal.link3, data: a3 }, { label: "α₄", color: pal.link4, data: a4 });
      }
    } else {
      const pos: number[] = [], vel: number[] = [], acc: number[] = [];
      for (let i = 0; i < STEPS; i++) {
        const st = analyzeSliderCrank(state.slider, (2 * Math.PI * i) / STEPS, state.omega2);
        const ok = st.valid;
        pos.push(ok ? st.sliderPos : NaN);
        vel.push(ok ? st.sliderVel : NaN);
        acc.push(ok ? st.sliderAcc : NaN);
      }
      const data = which === "angle" ? pos : which === "omega" ? vel : acc;
      series.push({ label: which, color: pal.accent, data });
    }

    const marker = ((((state.theta2 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI));
    drawPlot(ctx, w, h, series, { xLabel: "θ₂ (deg)", yLabel: unit, marker }, {
      grid: pal.plotGrid,
      axis: pal.axis,
      text: pal.text,
      marker: pal.accent,
    });
  });

  return (
    <div className="flex flex-col bg-bg">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5">
        <span className="truncate text-[10px] font-medium text-muted">{title}</span>
        <div className="flex flex-shrink-0 items-center gap-2">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1 text-[9px] text-faint">
              <span className="inline-block h-1.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          <span className="text-[9px] text-faint">{unit}</span>
        </div>
      </div>
      <canvas ref={ref} className="h-[128px] w-full" />
    </div>
  );
}

function norm(d: number) {
  let x = d % 360;
  if (x < 0) x += 360;
  return x;
}
