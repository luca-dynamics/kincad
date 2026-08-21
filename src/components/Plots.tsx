// Bottom engineering plots: output kinematics vs input angle over a full cycle.
//
// NOTHING BUT PLOTS. This drawer sits directly beneath the 2D canvas and takes its height out of
// the workspace, so it earns that height with curves only. The cycle-level figures that used to
// head this component now live in the right-hand dock (components/Insights.tsx → `CycleFigures`),
// which gave the canvas back ~120px.
//
// Three things matter here beyond drawing:
//
//   SAMPLING IS MEMOIZED. The draw effect deliberately has no dependency array so the crank marker
//   tracks the animation, which ticks at 60 Hz. The full-cycle solve used to sit *inside* that
//   effect, once per canvas — 1,080 linkage solves every frame. It now runs once per geometry
//   change, for all three canvases at once, and the effect only draws.
//
//   THE READOUT IS A SAMPLE, NOT AN INTERPOLATION. Values under the cursor are read out of the
//   same arrays that were drawn, so an arc the linkage cannot reach reads "—" rather than a number
//   the solver never produced.
//
//   SCRUBBING STOPS THE CLOCK. `onScrub` sets the angle and pauses: an angle that runs away the
//   instant you set it is not a scrub. Hovering without pressing only moves the readout.

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeFourBar, analyzeSliderCrank, degWrapped, type FourBarLinkage, type SliderCrankLinkage } from "../engine";
import { drawPlot, fractionAtX, type PlotTheme, type Series } from "../render/plot";
import { getPalette } from "../render/palette";
import { useTheme } from "../theme";
import type { MechanismKind, WorkspaceState } from "../state";
import { perSec, perSec2 } from "../units";

const TAU = 2 * Math.PI;
/**
 * Intervals across the cycle. Sampling is inclusive of both ends (STEPS + 1 points), so sample i
 * sits at θ₂ = 360·i/STEPS *and* at plot fraction i/STEPS — which is what lets the marker, the
 * cursor readout and the scrub target all refer to the same angle.
 */
const STEPS = 360;

type Which = "angle" | "omega" | "alpha";

/** One plotted curve: the label its legend shows, and the samples behind it. */
interface Curve {
  label: string;
  data: number[];
}

interface Props {
  state: WorkspaceState;
  /** Where a scrub goes. Omit to leave the plots read-only. */
  onScrub?: (theta2: number) => void;
}

export default function Plots({ state, onScrub }: Props) {
  const { theme } = useTheme(); // re-render on theme change
  void theme;
  const { kind, fourbar, slider, omega2, theta2, unit } = state;
  const four = kind === "fourbar";

  // Keyed on the geometry, not on θ₂ — the angle ticks every frame, the linkage does not.
  const curves = useMemo(() => sampleCycle(kind, fourbar, slider, omega2), [kind, fourbar, slider, omega2]);

  // One cursor for the whole strip: a scrub sets a single θ₂, so all three plots read out at it.
  const [cursor, setCursor] = useState<number | null>(null);

  const pal = getPalette();
  const colors = four ? [pal.link3, pal.link4] : [pal.accent];
  const plotTheme: PlotTheme = { grid: pal.plotGrid, axis: pal.axis, text: pal.text, marker: pal.accent };
  const marker = (((theta2 % TAU) + TAU) % TAU) / TAU;

  const shared = { colors, theme: plotTheme, marker, cursor, onCursor: setCursor, onScrub };

  return (
    // Stacked on a phone (the Insight tab), three across from `sm` up (the desktop drawer).
    <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
      {/* `axisUnit` is the UNIT of the y-axis, and the slider column used to be given `x`, `v` and
          `a` — the symbols for the quantities, which the legend already shows a line-swatch away.
          The axis now carries the declared length unit and its two time derivatives. */}
      <PlotCanvas
        {...shared}
        curves={curves.angle}
        title={four ? "Output angle vs θ₂" : "Slider position vs θ₂"}
        axisUnit={four ? "deg" : unit}
        decimals={four ? 1 : 3}
      />
      <PlotCanvas
        {...shared}
        curves={curves.omega}
        title={four ? "Angular velocity vs θ₂" : "Slider velocity vs θ₂"}
        axisUnit={four ? "rad/s" : perSec(unit)}
        decimals={four ? 2 : 3}
      />
      <PlotCanvas
        {...shared}
        curves={curves.alpha}
        title={four ? "Angular acceleration vs θ₂" : "Slider acceleration vs θ₂"}
        axisUnit={four ? "rad/s²" : perSec2(unit)}
        decimals={four ? 2 : 3}
      />
    </div>
  );
}

function PlotCanvas({
  curves,
  colors,
  theme,
  title,
  axisUnit,
  decimals,
  marker,
  cursor,
  onCursor,
  onScrub,
}: {
  curves: Curve[];
  colors: string[];
  theme: PlotTheme;
  title: string;
  axisUnit: string;
  decimals: number;
  marker: number;
  cursor: number | null;
  onCursor: (f: number | null) => void;
  onScrub?: (theta2: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  // No dependency array on purpose: the marker has to follow the animation. Only drawing happens
  // here now — the samples were computed once, above.
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
    const series: Series[] = curves.map((c, i) => ({ label: c.label, color: colors[i], data: c.data }));
    drawPlot(ctx, w, h, series, { xLabel: "θ₂ (deg)", yLabel: axisUnit, marker }, theme);
  });

  /** Cycle fraction under a pointer, or null when it is outside the plot box. */
  const fractionAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return fractionAtX(e.clientX - r.left, r.width);
  };

  const index = cursor === null ? null : Math.round(cursor * STEPS);

  return (
    <div className="flex flex-col bg-bg">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5">
        {/* While the cursor is on the plot the heading states the angle being read out; the title
            is redundant when you can see which plot you are pointing at, and this costs no height. */}
        <span className="truncate text-mini font-medium text-muted">
          {cursor === null ? title : <>θ₂ <span className="num">{(cursor * 360).toFixed(0)}°</span></>}
        </span>
        <div className="flex flex-shrink-0 items-center gap-2">
          {curves.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1 text-micro text-faint">
              <span className="inline-block h-1.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
              {c.label}
              {index !== null && <span className="num text-muted">{fmt(c.data[index], decimals)}</span>}
            </span>
          ))}
          <span className="text-micro text-faint">{axisUnit}</span>
        </div>
      </div>
      <canvas
        ref={ref}
        // touch-none: a drag across the plot must scrub, not scroll the page.
        className={`h-[128px] w-full touch-none ${onScrub ? "cursor-crosshair" : ""}`}
        onPointerDown={(e) => {
          const f = fractionAt(e);
          onCursor(f);
          if (f === null) return;
          // Scrub first, capture second: `setPointerCapture` can throw if the pointer is already
          // gone, and losing the press that started the drag would be the worse failure.
          onScrub?.(f * TAU);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No capture — the drag simply ends when the pointer leaves the canvas.
          }
        }}
        onPointerMove={(e) => {
          const f = fractionAt(e);
          onCursor(f);
          // buttons === 0 is a plain hover: read the values without moving the mechanism.
          if (f !== null && e.buttons !== 0) onScrub?.(f * TAU);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => onCursor(null)}
        onPointerLeave={() => onCursor(null)}
      />
    </div>
  );
}

/**
 * Every curve a mechanism produces over one revolution, solved once for the whole strip.
 * Unreachable angles become NaN, which `drawPlot` breaks the line at and the readout shows as "—":
 * a linkage that cannot assemble there must not appear to have a value there.
 */
function sampleCycle(
  kind: MechanismKind,
  fourbar: FourBarLinkage,
  slider: SliderCrankLinkage,
  omega2: number,
): Record<Which, Curve[]> {
  if (kind === "fourbar") {
    const t3: number[] = [], t4: number[] = [], w3: number[] = [], w4: number[] = [], a3: number[] = [], a4: number[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const st = analyzeFourBar(fourbar, (TAU * i) / STEPS, omega2);
      const ok = st.valid;
      t3.push(ok ? degWrapped(st.theta3) : NaN);
      t4.push(ok ? degWrapped(st.theta4) : NaN);
      w3.push(ok ? st.omega3 : NaN);
      w4.push(ok ? st.omega4 : NaN);
      a3.push(ok ? st.alpha3 : NaN);
      a4.push(ok ? st.alpha4 : NaN);
    }
    return {
      angle: [{ label: "θ₃", data: t3 }, { label: "θ₄", data: t4 }],
      omega: [{ label: "ω₃", data: w3 }, { label: "ω₄", data: w4 }],
      alpha: [{ label: "α₃", data: a3 }, { label: "α₄", data: a4 }],
    };
  }
  const pos: number[] = [], vel: number[] = [], acc: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const st = analyzeSliderCrank(slider, (TAU * i) / STEPS, omega2);
    const ok = st.valid;
    pos.push(ok ? st.sliderPos : NaN);
    vel.push(ok ? st.sliderVel : NaN);
    acc.push(ok ? st.sliderAcc : NaN);
  }
  return {
    angle: [{ label: "x", data: pos }],
    omega: [{ label: "v", data: vel }],
    alpha: [{ label: "a", data: acc }],
  };
}

/** A sample for the readout, or an em dash where the linkage does not assemble. */
function fmt(v: number | undefined, decimals: number) {
  return v != null && Number.isFinite(v) ? v.toFixed(decimals) : "—";
}
