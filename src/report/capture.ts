// Snapshot whatever is currently on the workspace surface — the 2D drawing, the 3D mechanism, or
// the CAD part. One helper for all three, used by the PNG export and by both PDF documents.
//
// WHY IT QUERIES A CONTAINER AND NOT AN ID ON THE CANVAS. This used to be
// `getElementById("cad-canvas")`, which is the id on the 2D Workspace canvas and the only element
// in the app carrying it — so in 3D and CAD the PNG button did nothing and the report came out with
// no drawing at all. The obvious fix, putting the same id on the r3f canvases, does not work:
// `CanvasProps extends React.HTMLAttributes<HTMLDivElement>`, so an `id` passed to r3f's `<Canvas>`
// lands on its WRAPPER DIV, never on the canvas element. So the id goes on the one container all
// three views mount into ([Viewport.tsx](../components/Viewport.tsx)) and the canvas is found
// inside it. Each view renders exactly one — drei's `GizmoHelper` draws the view cube into the same
// canvas rather than adding a second one.
//
// Both WebGL views already pass `gl={{ preserveDrawingBuffer: true }}`, which is what makes
// `toDataURL` return the rendered frame instead of a blank buffer. Removing that flag from either
// `<Canvas>` breaks every export here, silently and with a valid-looking empty PNG.

import { triggerDownload } from "./download";

export const SURFACE_ID = "kincad-surface";

/** The canvas of whichever view is mounted, or null (CAD with no model has no canvas). */
export function activeViewCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`#${SURFACE_ID} canvas`);
}

/** A PNG data URL of the active view, for embedding in a PDF. Undefined when there is no canvas. */
export function captureViewPNG(): string | undefined {
  return activeViewCanvas()?.toDataURL("image/png") ?? undefined;
}

/**
 * Download the active view as a PNG.
 *
 * Goes through `toBlob` rather than putting the data URL straight on an anchor's `href`: a 3D view
 * at `dpr={[1, 2]}` on a large display is several megabytes, and browsers cap `data:` navigations
 * well below that — the download would just not happen.
 */
export function downloadViewPNG(name: string): void {
  const canvas = activeViewCanvas();
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, name.endsWith(".png") ? name : `${name}.png`);
  }, "image/png");
}
