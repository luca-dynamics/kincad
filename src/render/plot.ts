// Lightweight engineering line-plot on a canvas. Used for theta/omega/alpha vs input angle.
// Kept dependency-free so the deterministic engine remains the only source of plotted data.

export interface Series {
  label: string;
  color: string;
  /** y values, one per sample; x is implied as index across the domain. */
  data: number[];
}

export interface PlotOpts {
  xLabel: string;
  /** Unit of the y axis. Drawn rotated at the left only when `scale` > 1; at strip size the HTML
   *  header above the canvas already carries it, and 9px of rotated text would not be read. */
  yLabel: string;
  /** marker drawn at this fractional position (0..1) of the x domain, e.g. current angle */
  marker?: number;
  /**
   * Linear magnification of every inset and text size, for the same curves drawn large. 1 is the
   * drawer strip beneath the canvas. Above 1 the axes also gain intermediate tick labels and a
   * y-axis unit: a plot big enough to read values off is a plot worth putting numbers on, and a
   * figure captured for a report has to stay legible after the page scales it down.
   */
  scale?: number;
}

export interface PlotTheme {
  grid: string;
  axis: string;
  text: string;
  marker: string;
}

/**
 * Plot box insets in CSS pixels at scale 1. Exported because hit-testing has to agree with drawing:
 * the scrub handler in components/Plots.tsx turns a pointer x into a cycle fraction with the same
 * constant `drawPlot` lays the axes out from, so the marker cannot drift from the finger. Both
 * scale by the same factor, which is why `fractionAtX` takes one too.
 */
export const PLOT_PAD = { l: 38, r: 8, t: 8, b: 20 } as const;

/**
 * Left inset in CSS pixels at a given scale. Wider than `PLOT_PAD.l` above strip size, because the
 * expanded plot puts a rotated unit outside the tick numbers and a six-character tick at 2.4× reaches
 * far enough left to strike through it. Both `drawPlot` and `fractionAtX` go through here so the
 * widening cannot land in one and not the other.
 */
function padLeftAt(scale: number): number {
  return (scale > 1 ? PLOT_PAD.l + 16 : PLOT_PAD.l) * scale;
}

/** Pointer slack outside the plot box, in CSS pixels — a touch just off the axis still scrubs. */
const GRAB = 6;

/**
 * Where a pointer at CSS-pixel `px` falls in the x domain of a plot `w` wide: 0 at θ₂ = 0°, 1 at
 * 360°. Within `GRAB` of either end the result clamps; beyond that it is `null`, so a drag that
 * leaves the axes stops scrubbing instead of pinning the mechanism to an edge.
 */
export function fractionAtX(px: number, w: number, scale = 1): number | null {
  const padL = padLeftAt(scale);
  const plotW = w - padL - PLOT_PAD.r * scale;
  if (plotW <= 0) return null;
  const grab = GRAB * scale;
  if (px < padL - grab || px > padL + plotW + grab) return null;
  return Math.max(0, Math.min(1, (px - padL) / plotW));
}

export function drawPlot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: Series[],
  opts: PlotOpts,
  theme: PlotTheme,
) {
  const AXIS = theme.axis;
  const TEXT = theme.text;
  const GRID = theme.grid;
  const s = opts.scale ?? 1;
  // Above strip size the axes carry intermediate labels, so the bottom gutter has to hold two
  // baselines: the tick numbers, and the axis title that used to share their line.
  const dense = s > 1;
  ctx.clearRect(0, 0, w, h);
  const padL = padLeftAt(s),
    padR = PLOT_PAD.r * s,
    padT = PLOT_PAD.t * s,
    padB = (dense ? PLOT_PAD.b + 10 : PLOT_PAD.b) * s;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // y range across all series
  let yMin = Infinity,
    yMax = -Infinity;
  for (const se of series)
    for (const v of se.data) {
      if (!isFinite(v)) continue;
      yMin = Math.min(yMin, v);
      yMax = Math.max(yMax, v);
    }
  if (!isFinite(yMin)) {
    yMin = -1;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const xOf = (i: number, n: number) => padL + (plotW * i) / Math.max(1, n - 1);
  const yOf = (v: number) =>
    padT + plotH - (plotH * (v - yMin)) / (yMax - yMin);

  // grid + zero line
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
  }
  // Vertical gridlines every 60° once the plot is large: reading a value off a curve means finding
  // its crank angle first, and 60° is the interval the tick labels below land on.
  if (dense)
    for (let g = 1; g < 6; g++) {
      const x = padL + (plotW * g) / 6;
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
    }
  ctx.stroke();
  if (yMin < 0 && yMax > 0) {
    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    ctx.moveTo(padL, yOf(0));
    ctx.lineTo(padL + plotW, yOf(0));
    ctx.stroke();
  }

  // axes
  ctx.strokeStyle = AXIS;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // At strip size: axis numbers only — titles/units/legend are rendered in the HTML header above
  // the canvas. Expanded, the figure has to stand on its own, so it labels every gridline.
  ctx.fillStyle = TEXT;
  ctx.font = `${9 * s}px ui-monospace, monospace`;
  ctx.textAlign = "right";
  if (dense) {
    for (let g = 0; g <= 4; g++) {
      const y = padT + (plotH * g) / 4;
      const val = yMax - ((yMax - yMin) * g) / 4;
      // Nudge the extremes inward so neither clips the plot box.
      const dy = g === 0 ? 7 * s : g === 4 ? 0 : 3.5 * s;
      ctx.fillText(val.toFixed(2), padL - 4 * s, y + dy);
    }
  } else {
    ctx.fillText(yMax.toFixed(1), padL - 4, padT + 7);
    ctx.fillText(yMin.toFixed(1), padL - 4, padT + plotH);
  }

  const tickY = padT + plotH + 12 * s;
  if (dense) {
    for (let g = 0; g <= 6; g++) {
      ctx.textAlign = g === 0 ? "left" : g === 6 ? "right" : "center";
      ctx.fillText(String(60 * g), padL + (plotW * g) / 6, tickY);
    }
    ctx.textAlign = "center";
    ctx.fillText(opts.xLabel, padL + plotW / 2, h - 4 * s);
    if (opts.yLabel) {
      ctx.save();
      ctx.translate(10 * s, padT + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(opts.yLabel, 0, 0);
      ctx.restore();
    }
  } else {
    ctx.textAlign = "left";
    ctx.fillText("0", padL, h - 5);
    ctx.textAlign = "right";
    ctx.fillText("360", padL + plotW, h - 5);
    ctx.textAlign = "center";
    ctx.fillText(opts.xLabel, padL + plotW / 2, h - 5);
  }

  // current-angle marker
  if (opts.marker != null) {
    const mx = padL + plotW * Math.max(0, Math.min(1, opts.marker));
    ctx.strokeStyle = theme.marker;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, padT + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // series
  for (const se of series) {
    ctx.strokeStyle = se.color;
    ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    let started = false;
    se.data.forEach((v, i) => {
      if (!isFinite(v)) {
        started = false;
        return;
      }
      const x = xOf(i, se.data.length);
      const y = yOf(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
