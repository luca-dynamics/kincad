import { describe, it, expect } from "vitest";
import { drawGrid } from "../draw";
import type { View } from "../view";
import type { Palette } from "../palette";

/**
 * drawGrid steps a screen coordinate across the canvas and its only loop exit is "coordinate walked
 * off the edge". A degenerate view — which a canvas measured at ~0 size during a pane transition
 * produces (see fitView) — makes the step 0/NaN, the coordinate never advances, and the tab freezes.
 * This is the regression behind "the page hangs when it switches to the 2D workspace". These cover
 * that the routine ALWAYS terminates, with a bounded number of draw calls.
 */

const PAL = { bg: "#000", grid: "#111", axis: "#222" } as unknown as Palette;

/**
 * A stub 2D context that counts moveTo calls and — crucially — throws once they exceed a sane cap,
 * so a re-broken guard fails this test in milliseconds instead of hanging the whole run forever.
 */
function fakeCtx() {
  const state = { moveToCount: 0 };
  const ctx = {
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
    beginPath() {},
    moveTo() {
      if (++state.moveToCount > 100_000) throw new Error("drawGrid did not terminate");
    },
    lineTo() {},
    stroke() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, state };
}

describe("drawGrid — cannot hang the tab", () => {
  const W = 900;
  const H = 520;

  it("draws a bounded grid for a normal view", () => {
    const { ctx, state } = fakeCtx();
    drawGrid(ctx, W, H, { scale: 40, cx: W / 2, cy: H / 2 }, PAL);
    expect(state.moveToCount).toBeGreaterThan(0);
    expect(state.moveToCount).toBeLessThan(1000);
  });

  it("terminates for extreme but finite scales", () => {
    for (const scale of [1e-9, 1e9, 1e-3, 1234.5]) {
      const { ctx, state } = fakeCtx();
      drawGrid(ctx, W, H, { scale, cx: W / 2, cy: H / 2 }, PAL);
      expect(state.moveToCount).toBeLessThan(100_000);
    }
  });

  it("draws nothing (and does not loop) for a degenerate view", () => {
    // scale <= 0 or non-finite: exactly what fitView returned when the canvas was 0-sized. The old
    // code looped here forever; the guard must return before drawing anything.
    for (const scale of [0, -5, NaN, Infinity, -Infinity]) {
      const { ctx, state } = fakeCtx();
      const view: View = { scale, cx: W / 2, cy: H / 2 };
      expect(() => drawGrid(ctx, W, H, view, PAL)).not.toThrow();
      expect(state.moveToCount).toBe(0);
    }
  });
});
