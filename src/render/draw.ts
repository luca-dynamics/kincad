// Canvas drawing for planar mechanisms. Pure drawing functions — they read engine output,
// a View, and a theme Palette, and paint. They never compute kinematics.

import type { FourBarState, SliderCrankState, Vec2 } from "../engine";
import type { Palette } from "./palette";
import { worldToScreen, type View } from "./view";

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number, pal: Palette) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: View,
  pal: Palette,
) {
  // A degenerate view freezes the tab. The two loops below only exit when a screen coordinate walks
  // off the canvas, so if `view.scale` is non-positive or non-finite (a canvas measured at ~0 size
  // during a pane transition yields exactly that — see fitView), `step` comes out 0/NaN, the
  // coordinate never advances, and the loop spins forever. Nothing sensible to draw then, so bail.
  if (!Number.isFinite(view.scale) || view.scale <= 0) return;

  const target = 60;
  const raw = target / view.scale;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c * view.scale >= 40) ?? candidates[candidates.length - 1];
  if (!Number.isFinite(step) || step <= 0) return; // belt-and-braces: keep the loops bounded

  ctx.lineWidth = 1;
  const originS = worldToScreen({ x: 0, y: 0 }, view);
  ctx.strokeStyle = pal.grid;
  ctx.beginPath();
  const startX = Math.floor((0 - originS.x) / (step * view.scale)) * step;
  for (let x = startX; ; x += step) {
    const sx = originS.x + x * view.scale;
    if (sx > w) break;
    if (sx < 0) continue;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  const startY = Math.floor((0 - originS.y) / (step * view.scale)) * step;
  for (let y = startY; ; y += step) {
    const sy = originS.y + y * view.scale;
    if (sy > h) break;
    if (sy < 0) continue;
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();

  ctx.strokeStyle = pal.axis;
  ctx.beginPath();
  ctx.moveTo(0, originS.y);
  ctx.lineTo(w, originS.y);
  ctx.moveTo(originS.x, 0);
  ctx.lineTo(originS.x, h);
  ctx.stroke();
}

function movingJoint(ctx: CanvasRenderingContext2D, p: Vec2, pal: Palette) {
  ctx.fillStyle = pal.joint;
  ctx.strokeStyle = pal.bg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5.5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();
}

function fixedPivot(ctx: CanvasRenderingContext2D, p: Vec2, pal: Palette) {
  ctx.fillStyle = pal.ground;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = pal.ground;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - 9, p.y + 13);
  ctx.lineTo(p.x + 9, p.y + 13);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  for (let i = -9; i <= 11; i += 4) {
    ctx.moveTo(p.x + i, p.y + 13);
    ctx.lineTo(p.x + i - 5, p.y + 18);
  }
  ctx.moveTo(p.x - 12, p.y + 13);
  ctx.lineTo(p.x + 12, p.y + 13);
  ctx.stroke();
}

function link(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  color: string,
  width = 6,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/**
 * A link's name tag (r₁ … r₄, matching the Params dock and the report) centred on the midpoint of
 * its two SCREEN endpoints. A thick halo in the background colour keeps it legible where it sits on
 * top of the coloured 6px link. Drawn only when the Labels toggle is on: it identifies which
 * segment is which, so someone who does not know the r-notation can still tell r₂ from r₄ before
 * grabbing a handle. Endpoints are already in screen space, so this reads no View.
 */
function linkLabel(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  text: string,
  color: string,
  pal: Palette,
) {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = pal.bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawCouplerCurve(
  ctx: CanvasRenderingContext2D,
  curve: Vec2[],
  view: View,
  pal: Palette,
) {
  if (curve.length < 2) return;
  ctx.strokeStyle = pal.curve;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  curve.forEach((p, i) => {
    const s = worldToScreen(p, view);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export interface Handle {
  id: "O4" | "A" | "B" | "P";
  screen: Vec2;
}

export function drawFourBar(
  ctx: CanvasRenderingContext2D,
  st: FourBarState,
  view: View,
  pal: Palette,
  opts: { showHandles: boolean; showLabels?: boolean } = { showHandles: true },
): Handle[] {
  const O2 = worldToScreen(st.O2, view);
  const O4 = worldToScreen(st.O4, view);
  const A = worldToScreen(st.A, view);
  const B = worldToScreen(st.B, view);
  const P = worldToScreen(st.P, view);

  ctx.strokeStyle = pal.ground;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([6, 5]);
  link(ctx, O2, O4, pal.ground, 1.5);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (st.valid) {
    ctx.fillStyle = hexA(pal.link3, 0.12);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.lineTo(P.x, P.y);
    ctx.closePath();
    ctx.fill();

    link(ctx, A, B, pal.link3, 6);
    link(ctx, A, P, pal.link3, 3);
    link(ctx, B, P, pal.link3, 3);
    link(ctx, O2, A, pal.link2, 6);
    link(ctx, O4, B, pal.link4, 6);

    movingJoint(ctx, A, pal);
    movingJoint(ctx, B, pal);
    ctx.fillStyle = pal.couplerPt;
    ctx.beginPath();
    ctx.arc(P.x, P.y, 4.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  fixedPivot(ctx, O2, pal);
  fixedPivot(ctx, O4, pal);

  if (opts.showLabels) {
    // r₁ is the fixed frame O₂→O₄, so it is drawn whether or not the assembly closes; the moving
    // links only have a pose to sit on when it does (an open dyad has no A/B between them).
    linkLabel(ctx, O2, O4, "r₁", pal.ground, pal);
    if (st.valid) {
      linkLabel(ctx, O2, A, "r₂", pal.link2, pal);
      linkLabel(ctx, A, B, "r₃", pal.link3, pal);
      linkLabel(ctx, O4, B, "r₄", pal.link4, pal);
    }
  }

  const handles: Handle[] = [
    { id: "O4", screen: O4 },
    ...(st.valid
      ? ([
          { id: "A", screen: A },
          { id: "B", screen: B },
          { id: "P", screen: P },
        ] as Handle[])
      : []),
  ];

  if (opts.showHandles) drawHandles(ctx, handles, pal);
  return handles;
}

export function drawSliderCrank(
  ctx: CanvasRenderingContext2D,
  st: SliderCrankState,
  view: View,
  pal: Palette,
  opts: { showHandles: boolean; showLabels?: boolean } = { showHandles: true },
): Handle[] {
  const O2 = worldToScreen(st.O2, view);
  const A = worldToScreen(st.A, view);
  const B = worldToScreen(st.B, view);

  const railY = B.y;
  ctx.strokeStyle = pal.ground;
  ctx.globalAlpha = 0.4;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(0, railY);
  ctx.lineTo(ctx.canvas.width, railY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  if (st.valid) {
    link(ctx, O2, A, pal.link2, 6);
    link(ctx, A, B, pal.link3, 6);
    ctx.fillStyle = hexA(pal.link4, 0.18);
    ctx.strokeStyle = pal.link4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(B.x - 17, B.y - 11, 34, 22);
    ctx.fill();
    ctx.stroke();
    movingJoint(ctx, A, pal);
    movingJoint(ctx, B, pal);
  }
  fixedPivot(ctx, O2, pal);

  if (opts.showLabels && st.valid) {
    linkLabel(ctx, O2, A, "r₂", pal.link2, pal);
    linkLabel(ctx, A, B, "r₃", pal.link3, pal);
  }

  const handles: Handle[] = st.valid ? [{ id: "A", screen: A }] : [];
  if (opts.showHandles) drawHandles(ctx, handles, pal);
  return handles;
}

function drawHandles(ctx: CanvasRenderingContext2D, handles: Handle[], pal: Palette) {
  for (const h of handles) {
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(h.screen.x, h.screen.y, 11, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function hitTest(
  handles: Handle[],
  sx: number,
  sy: number,
  radius = 14,
): Handle | null {
  for (const h of handles) {
    if (Math.hypot(h.screen.x - sx, h.screen.y - sy) <= radius) return h;
  }
  return null;
}

/** Apply an alpha to a hex colour (#rgb or #rrggbb). Falls back to the colour as-is. */
function hexA(hex: string, a: number): string {
  const m = hex.replace("#", "");
  if (m.length === 3) {
    const r = parseInt(m[0] + m[0], 16);
    const g = parseInt(m[1] + m[1], 16);
    const b = parseInt(m[2] + m[2], 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  if (m.length === 6) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return hex;
}
