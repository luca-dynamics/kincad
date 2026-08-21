import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "dark", toggle: () => {}, setTheme: () => {} });

function initialTheme(): Theme {
  const stored = localStorage.getItem("kincad-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
// NOTE: index.html runs this same resolution in a blocking inline script so the `dark` class is on
// <html> before first paint. Change the key, the values or the fallback here and you must change it
// there too — otherwise the page paints one theme and React immediately flips it to the other.

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  /**
   * Flips the `dark` class HERE, in the event handler, *before* React re-renders — not in the
   * effect below. Every canvas in the app reads its colours off `getComputedStyle` during
   * RENDER (`getPalette()` in Plots/draw, the `useMemo` in ThreeView/CadView), and an effect
   * runs after that render has already committed. Flip the class in an effect and each canvas
   * paints one render behind, in the OUTGOING palette — then nothing schedules a repaint, so a
   * paused mechanism and all three plots keep the old theme's colours indefinitely.
   */
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    setThemeState(t);
  }, []);

  // Mount, plus a safety net: the handler above owns every later flip, and both writes are
  // idempotent. This is also what applies the stored theme on a reload.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("kincad-theme", theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(Ctx);
