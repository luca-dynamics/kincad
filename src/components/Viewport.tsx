// The center "screen": a toolbar + a swappable render surface (2D kinematics canvas, 3D
// mechanism, or generated CAD) + a collapsible plots drawer.

import { lazy, Suspense } from "react";
import TopBar, { type PanelToggles, type ViewMode } from "./TopBar";
import { ErrorBoundary } from "./ErrorBoundary";
import Workspace from "./Workspace";
import Plots from "./Plots";
import type { WorkspaceState } from "../state";
import type { FourBarLinkage, SliderCrankLinkage } from "../engine";
import type { MeshFormat } from "../cad/export";
import { SURFACE_ID } from "../report/capture";

const ThreeView = lazy(() => import("./three/ThreeView"));
const CadView = lazy(() => import("./three/CadView"));

interface Props {
  state: WorkspaceState;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  plotsOpen: boolean;
  onTogglePlots: () => void;
  onPatch: (p: Partial<WorkspaceState>) => void;
  onPatchFourBar: (p: Partial<FourBarLinkage>) => void;
  onPatchSlider: (p: Partial<SliderCrankLinkage>) => void;
  onSetTheta2: (t: number) => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onExportPDF: () => void;
  onExportPNG: () => void;
  onExportModel: (format: MeshFormat) => void;
  /** Straight through to TopBar. Undefined on mobile — this component is shared by both layouts. */
  panels?: PanelToggles;
}

const Fallback = ({ label }: { label: string }) => (
  <div className="grid h-full w-full place-items-center px-6 text-center text-meta text-faint">{label}</div>
);

export default function Viewport(p: Props) {
  const isCad = p.viewMode === "cad";
  return (
    <div className="flex h-full min-w-0 flex-col bg-bg">
      <TopBar
        state={p.state}
        viewMode={p.viewMode}
        onSetViewMode={p.onSetViewMode}
        hasCad={!!p.state.cadModel}
        plotsOpen={p.plotsOpen}
        onTogglePlots={p.onTogglePlots}
        onTogglePlay={p.onTogglePlay}
        onReset={p.onReset}
        onPatch={p.onPatch}
        onExportPDF={p.onExportPDF}
        onExportPNG={p.onExportPNG}
        onExportModel={p.onExportModel}
        panels={p.panels}
      />

      {/* The capture anchor for every export. All three views mount into this one container, and
          `activeViewCanvas()` finds the canvas inside it — see [capture.ts](../report/capture.ts)
          for why the id cannot live on the r3f `<Canvas>` itself. */}
      <div id={SURFACE_ID} className="relative min-h-0 flex-1">
        {p.viewMode === "2d" && (
          <Workspace
            state={p.state}
            onPatchFourBar={p.onPatchFourBar}
            onPatchSlider={p.onPatchSlider}
            onSetTheta2={p.onSetTheta2}
          />
        )}
        {p.viewMode === "3d" && (
          <ErrorBoundary label="Couldn't load the 3D view.">
            <Suspense fallback={<Fallback label="loading 3D view…" />}>
              <ThreeView state={p.state} onSetTheta2={p.onSetTheta2} />
            </Suspense>
          </ErrorBoundary>
        )}
        {isCad &&
          (p.state.cadModel ? (
            <ErrorBoundary label="Couldn't load the CAD view.">
              <Suspense fallback={<Fallback label="building CAD model…" />}>
                <CadView model={p.state.cadModel} showLabels={p.state.showLabels} unit={p.state.unit} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <Fallback label="No CAD model yet. Ask the agent to generate one." />
          ))}
      </div>

      {p.plotsOpen && !isCad && (
        <div className="hidden flex-shrink-0 border-t border-line sm:block">
          {/* Scrubbing sets the angle and stops the clock — `onPatch` does both, where
              `onSetTheta2` would leave the animation to overwrite the drag on the next frame. */}
          <Plots state={p.state} onScrub={(t) => p.onPatch({ theta2: t, playing: false })} />
        </div>
      )}
    </div>
  );
}
