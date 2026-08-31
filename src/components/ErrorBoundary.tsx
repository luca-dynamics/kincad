import { Component, type ReactNode } from "react";
import { Button } from "./ui";

/**
 * Catches render-time errors — most importantly a failed lazy chunk import, which `Suspense`
 * re-throws rather than handles. Without a boundary, a 404 on a code-split chunk (the case for any
 * tab left open across a deploy, when the build's chunk hashes have rotated and the old files are
 * gone) unmounts the whole app and leaves a blank screen.
 *
 * `vite:preloadError` in main.tsx auto-reloads stale tabs, which fixes the common case silently.
 * This is the belt-and-braces fallback for when a reload does NOT help — a genuinely missing chunk
 * or an ordinary render bug — so the user sees a message and a Reload button instead of nothing.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid h-full w-full place-items-center px-6 text-center">
        <div className="max-w-xs space-y-3">
          <p className="text-body font-semibold text-fg">
            {this.props.label ?? "Something went wrong rendering this view."}
          </p>
          <p className="text-meta text-faint">This can happen right after an update. Reloading usually fixes it.</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
