// Bottom engineering plots: output kinematics vs input angle over a full cycle.
//
// NOTHING BUT PLOTS. This drawer sits directly beneath the 2D canvas and takes its height out of
// the workspace, so it earns that height with curves only. The cycle-level figures that used to
// head this component now live in the right-hand dock (components/Insights.tsx → `CycleFigures`),
// which gave the canvas back ~120px.
//
// Four things matter here beyond drawing:
//
//   SAMPLING IS MEMOIZED. The draw effect deliberately has no dependency array so the crank marker
//   tracks the animation, which ticks at 60 Hz. The full-cycle solve used to sit *inside* that
//   effect, once per canvas — 1,080 linkage solves every frame. It now runs once per geometry
//   change, for all three canvases at once, and the effect only draws.
//
//   THE READOUT IS A SAMPLE, NOT AN INTERPOLATION. Values under the cursor are read out of the
//   same arrays that were drawn, so an arc the linkage cannot reach reads "—" rather than a number
//   the solver never produced. The expanded view's table is read out of those same arrays, which is
//   what makes a captured figure and a tabulated reading agree by construction rather than by hand.
//
//   SCRUBBING STOPS THE CLOCK. `onScrub` sets the angle and pauses: an angle that runs away the
//   instant you set it is not a scrub. Hovering without pressing only moves the readout.
//
//   EXPANDING IS NOT A CLICK ON THE CANVAS. A press already scrubs, and taking that away to open a
//   dialog would trade the more useful gesture for the rarer one. The affordance is the button in
//   each header, with a double-click as the shortcut.

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { analyzeFourBar, analyzeSliderCrank, degWrapped, type FourBarLinkage, type SliderCrankLinkage } from "../engine";
import { drawPlot, fractionAtX, type PlotTheme, type Series } from "../render/plot";
import { getPalette } from "../render/palette";
import { useTheme } from "../theme";
import { SegToggle } from "./ui";
import type { MechanismKind, WorkspaceState } from "../state";
import { perSec, perSec2 } from "../units";

const TAU = 2 * Math.PI;
/**
 * Intervals across the cycle. Sampling is inclusive of both ends (STEPS + 1 points), so sample i
 * sits at θ₂ = 360·i/STEPS *and* at plot fraction i/STEPS — which is what lets the marker, the
 * cursor readout, the scrub target and the expanded view's table all refer to the same angle.
 * At 360 the index is the crank angle in whole degrees, which every tabulation interval divides.
 */
const STEPS = 360;

/** Magnification of the expanded canvas over the strip. Drives text size and axis labelling. */
const ZOOM = 2.4;

/** Tabulation intervals for the expanded view, in degrees. Each divides 360 exactly, so every
 *  listed angle is a sample the solver actually produced rather than an interpolation. */
type Interval = "15" | "30" | "45" | "60";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "15", label: "15°" },
  { value: "30", label: "30°" },
  { value: "45", label: "45°" },
  { value: "60", label: "60°" },
];

type Which = "angle" | "omega" | "alpha";

/** One plotted curve: the label its legend shows, and the samples behind it. */
interface Curve {
  label: string;
  data: number[];
}

/**
 * A plot's identity: what it is called, what its y axis is in, and how precisely it reads out.
 * One list drives the three canvases, the expanded view's selector and its table columns, so a
 * heading, an axis unit and a tabulated figure cannot disagree about the same quantity.
 */
interface PlotSpec {
  which: Which;
  title: string;
  axisUnit: string;
  decimals: number;
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
  const [expanded, setExpanded] = useState<Which | null>(null);

  const pal = getPalette();
  const colors = four ? [pal.link3, pal.link4] : [pal.accent];
  const plotTheme: PlotTheme = { grid: pal.plotGrid, axis: pal.axis, text: pal.text, marker: pal.accent };
  const marker = (((theta2 % TAU) + TAU) % TAU) / TAU;

  // `axisUnit` is the UNIT of the y axis, and the slider column used to be given `x`, `v` and `a` —
  // the symbols for the quantities, which the legend already shows a line-swatch away. The axis
  // carries the declared length unit and its two time derivatives.
  const specs: PlotSpec[] = four
    ? [
        { which: "angle", title: "Output angle vs θ₂", axisUnit: "deg", decimals: 1 },
        { which: "omega", title: "Angular velocity vs θ₂", axisUnit: "rad/s", decimals: 2 },
        { which: "alpha", title: "Angular acceleration vs θ₂", axisUnit: "rad/s²", decimals: 2 },
      ]
    : [
        { which: "angle", title: "Slider position vs θ₂", axisUnit: unit, decimals: 3 },
        { which: "omega", title: "Slider velocity vs θ₂", axisUnit: perSec(unit), decimals: 3 },
        { which: "alpha", title: "Slider acceleration vs θ₂", axisUnit: perSec2(unit), decimals: 3 },
      ];

  return (
    <>
      {/* Stacked on a phone (the Insight tab), three across from `sm` up (the desktop drawer). */}
      <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
        {specs.map((spec) => (
          <PlotCanvas
            key={spec.which}
            spec={spec}
            curves={curves[spec.which]}
            colors={colors}
            theme={plotTheme}
            marker={marker}
            cursor={cursor}
            onCursor={setCursor}
            onScrub={onScrub}
            onExpand={() => setExpanded(spec.which)}
          />
        ))}
      </div>
      {expanded && (
        <PlotDialog
          specs={specs}
          which={expanded}
          onWhich={setExpanded}
          onClose={() => setExpanded(null)}
          curves={curves}
          colors={colors}
          theme={plotTheme}
          marker={marker}
          onScrub={onScrub}
        />
      )}
    </>
  );
}

/**
 * The canvas itself. Shared by the drawer strip and the expanded dialog so the marker, the readout
 * and the scrub target cannot drift apart between the two sizes: both derive the cycle fraction
 * from `fractionAtX` at the same scale the axes were drawn at.
 */
function PlotSurface({
  curves,
  colors,
  theme,
  marker,
  scale,
  className,
  xLabel,
  yLabel,
  onCursor,
  onScrub,
  onDoubleClick,
}: {
  curves: Curve[];
  colors: string[];
  theme: PlotTheme;
  marker: number;
  scale: number;
  className: string;
  xLabel: string;
  yLabel: string;
  onCursor: (f: number | null) => void;
  onScrub?: (theta2: number) => void;
  onDoubleClick?: () => void;
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
    drawPlot(ctx, w, h, series, { xLabel, yLabel, marker, scale }, theme);
  });

  /** Cycle fraction under a pointer, or null when it is outside the plot box. */
  const fractionAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return fractionAtX(e.clientX - r.left, r.width, scale);
  };

  return (
    <canvas
      ref={ref}
      // touch-none: a drag across the plot must scrub, not scroll the page.
      className={`w-full touch-none ${onScrub ? "cursor-crosshair" : ""} ${className}`}
      onDoubleClick={onDoubleClick}
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
  );
}

function PlotCanvas({
  spec,
  curves,
  colors,
  theme,
  marker,
  cursor,
  onCursor,
  onScrub,
  onExpand,
}: {
  spec: PlotSpec;
  curves: Curve[];
  colors: string[];
  theme: PlotTheme;
  marker: number;
  cursor: number | null;
  onCursor: (f: number | null) => void;
  onScrub?: (theta2: number) => void;
  onExpand: () => void;
}) {
  const index = cursor === null ? null : Math.round(cursor * STEPS);

  return (
    <div className="flex flex-col bg-bg">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5">
        {/* While the cursor is on the plot the heading states the angle being read out; the title
            is redundant when you can see which plot you are pointing at, and this costs no height. */}
        <span className="truncate text-mini font-medium text-muted">
          {cursor === null ? spec.title : <>θ₂ <span className="num">{(cursor * 360).toFixed(0)}°</span></>}
        </span>
        <div className="flex flex-shrink-0 items-center gap-2">
          {curves.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1 text-micro text-faint">
              <span className="inline-block h-1.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
              {c.label}
              {index !== null && <span className="num text-muted">{fmt(c.data[index], spec.decimals)}</span>}
            </span>
          ))}
          <span className="text-micro text-faint">{spec.axisUnit}</span>
          <button
            onClick={onExpand}
            title="Expand plot"
            aria-label={`Expand ${spec.title}`}
            // Hand-rolled at 20px rather than `IconButton`: this sits in a one-line header above a
            // 128px canvas, and the shared 32px square would take that height back out of the plot.
            className="grid h-5 w-5 flex-shrink-0 place-items-center rounded text-faint transition-colors hover:bg-line hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <PlotSurface
        curves={curves}
        colors={colors}
        theme={theme}
        marker={marker}
        scale={1}
        className="h-[128px]"
        xLabel="θ₂ (deg)"
        yLabel={spec.axisUnit}
        onCursor={onCursor}
        onScrub={onScrub}
        onDoubleClick={onExpand}
      />
    </div>
  );
}

/**
 * One plot at reading size, with the samples behind it tabulated over the complete revolution.
 *
 * The table is the point. A curve read off a 128px strip is an impression; the same curve beside
 * the numbers it was drawn from is a result, and the two cannot disagree because they come from one
 * array. 0° and 360° are both listed — the cycle closing on itself is a property worth showing, not
 * a duplicate row to trim.
 */
function PlotDialog({
  specs,
  which,
  onWhich,
  onClose,
  curves,
  colors,
  theme,
  marker,
  onScrub,
}: {
  specs: PlotSpec[];
  which: Which;
  onWhich: (w: Which) => void;
  onClose: () => void;
  curves: Record<Which, Curve[]>;
  colors: string[];
  theme: PlotTheme;
  marker: number;
  onScrub?: (theta2: number) => void;
}) {
  // Not named `interval`/`setInterval`: that shadows the global timer function inside a component
  // whose siblings all animate.
  const [tabStep, setTabStep] = useState<Interval>("30");
  const [cursor, setCursor] = useState<number | null>(null);
  const spec = specs.find((s) => s.which === which) ?? specs[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const step = Number(tabStep);
  const angles: number[] = [];
  for (let d = 0; d <= 360; d += step) angles.push(d);

  // Every quantity, not just the expanded one: a reading is only useful next to the others taken at
  // the same crank angle, and this is the table a report reproduces.
  const cols = specs.flatMap((sp) => curves[sp.which].map((c, i) => ({ sp, c, color: colors[i] })));
  const shown = curves[which];
  const index = cursor === null ? null : Math.round(cursor * STEPS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={spec.title}
        className="glass glass-modal flex max-h-[90dvh] w-[min(1000px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-body font-semibold text-fg">{spec.title}</span>
            <span className="flex-shrink-0 text-meta text-faint">{spec.axisUnit}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <SegToggle
              value={which}
              options={specs.map((s) => ({ value: s.which, label: quantityLabel(s) }))}
              onChange={onWhich}
            />
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close expanded plot"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-line hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-3 pt-2 text-mini">
          <div className="flex flex-wrap items-center gap-3">
            {shown.map((c, i) => (
              <span key={c.label} className="flex items-center gap-1.5 text-muted">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: colors[i] }} />
                {c.label}
                {index !== null && <span className="num text-fg">{fmt(c.data[index], spec.decimals)}</span>}
              </span>
            ))}
          </div>
          <span className="flex-shrink-0 text-faint">
            {cursor === null ? "drag to scrub" : <>θ₂ <span className="num text-muted">{(cursor * 360).toFixed(0)}°</span></>}
          </span>
        </div>

        <div className="px-3 pb-1 pt-1">
          <PlotSurface
            curves={shown}
            colors={colors}
            theme={theme}
            marker={marker}
            scale={ZOOM}
            // Sized so the curve and a 30° table of the same samples fit one frame on a laptop:
            // the figure this view exists to produce is the two together, and a screenshot that
            // cuts the last rows off would need the scroll position explained beside it.
            className="h-[min(38dvh,340px)] rounded-lg"
            xLabel="Crank angle θ₂ (degrees)"
            yLabel={spec.axisUnit}
            onCursor={setCursor}
            onScrub={onScrub}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-mini font-medium text-muted">
            Readings over one complete revolution
          </span>
          <SegToggle value={tabStep} options={INTERVALS} onChange={setTabStep} />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
          <table className="w-full border-collapse text-mini">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line text-muted">
                <th className="px-2 py-1.5 text-left font-medium">θ₂</th>
                {cols.map(({ sp, c, color }) => (
                  <th key={sp.which + c.label} className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-1.5 w-2 rounded-sm" style={{ background: color }} />
                      {c.label}
                    </span>
                    <span className="ml-1 text-micro font-normal text-faint">{sp.axisUnit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {angles.map((d) => (
                <tr key={d} className="border-b border-line/40">
                  <td className="num px-2 py-0.5 text-left text-muted">{d}°</td>
                  {cols.map(({ sp, c }) => (
                    <td key={sp.which + c.label} className="num px-2 py-0.5 text-right text-fg">
                      {fmt(c.data[d], sp.decimals)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** The selector's name for a plot. The quantity, not the axis sentence: the heading beside it
 *  already spells out "Angular velocity vs θ₂". */
function quantityLabel(spec: PlotSpec): string {
  return { angle: "Position", omega: "Velocity", alpha: "Acceleration" }[spec.which];
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
