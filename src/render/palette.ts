// Reads the active theme's canvas colours from CSS variables so the renderer matches
// light/dark mode. Call getPalette() each frame (it's a cheap getComputedStyle read).

export interface Palette {
  bg: string;
  grid: string;
  axis: string;
  ground: string;
  link2: string;
  link3: string;
  link4: string;
  joint: string;
  couplerPt: string;
  curve: string;
  plotGrid: string;
  text: string;
  accent: string;
}

let cache: { key: string; pal: Palette } | null = null;

export function getPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const key = (document.documentElement.classList.contains("dark") ? "d" : "l");
  if (cache && cache.key === key) return cache.pal;
  const pal: Palette = {
    bg: v("--canvas-bg"),
    grid: v("--canvas-grid"),
    axis: v("--canvas-axis"),
    ground: v("--c-ground"),
    link2: v("--c-link2"),
    link3: v("--c-link3"),
    link4: v("--c-link4"),
    joint: v("--c-joint"),
    couplerPt: v("--c-coupler-pt"),
    curve: v("--c-curve"),
    plotGrid: v("--c-plot-grid"),
    text: v("--muted"),
    accent: v("--accent"),
  };
  cache = { key, pal };
  return pal;
}

/** Invalidate the cache when the theme changes. */
export function clearPaletteCache() {
  cache = null;
}
