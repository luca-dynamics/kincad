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
  yLabel: string;
  /** marker drawn at this fractional position (0..1) of the x domain, e.g. current angle */
  marker?: number;
}

export interface PlotTheme {
  grid: string;
  axis: string;
  text: string;
  marker: string;
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
  ctx.clearRect(0, 0, w, h);
  const padL = 38,
    padR = 8,
    padT = 8,
    padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // y range across all series
  let yMin = Infinity,
    yMax = -Infinity;
  for (const s of series)
    for (const v of s.data) {
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

  // axis numbers only — titles/units/legend are rendered in the HTML header above the canvas
  ctx.fillStyle = TEXT;
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(yMax.toFixed(1), padL - 4, padT + 7);
  ctx.fillText(yMin.toFixed(1), padL - 4, padT + plotH);
  ctx.textAlign = "left";
  ctx.fillText("0", padL, h - 5);
  ctx.textAlign = "right";
  ctx.fillText("360", padL + plotW, h - 5);
  ctx.textAlign = "center";
  ctx.fillText("θ₂ (deg)", padL + plotW / 2, h - 5);

  // current-angle marker
  if (opts.marker != null) {
    const mx = padL + plotW * Math.max(0, Math.min(1, opts.marker));
    ctx.strokeStyle = theme.marker;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, padT + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // series
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    s.data.forEach((v, i) => {
      if (!isFinite(v)) {
        started = false;
        return;
      }
      const x = xOf(i, s.data.length);
      const y = yOf(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
