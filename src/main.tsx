import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "./theme";
import { ErrorBoundary } from "./components/ErrorBoundary";

// A tab left open across a deploy still references the previous build's code-split chunks; those
// filenames are content-hashed, so the new deploy no longer has them and the first lazy import
// 404s. Vite dispatches `vite:preloadError` on that failure — reload once to pull the fresh
// index.html (and current chunk hashes). The timestamp guard re-arms after 15s so the NEXT deploy
// can reload again, but a genuinely missing chunk cannot spin into a reload loop.
window.addEventListener("vite:preloadError", () => {
  const KEY = "kincad:chunkReloadAt";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 15_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
