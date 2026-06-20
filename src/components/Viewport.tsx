// The center "screen": a toolbar + a swappable render surface (2D kinematics canvas, 3D
// mechanism, or generated CAD) + a collapsible plots drawer.

import { lazy, Suspense } from "react";
import TopBar, { type ViewMode } from "./TopBar";
import Workspace from "./Workspace";
import Plots from "./Plots";
import type { WorkspaceState } from "../state";
import type { FourBarLinkage, SliderCrankLinkage } from "../engine";

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
  onExportSTL: () => void;
}

const Fallback = ({ label }: { label: string }) => (
  <div className="grid h-full w-full place-items-center text-xs text-faint">{label}</div>
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
        onExportSTL={p.onExportSTL}
      />

      <div className="relative min-h-0 flex-1">
        {p.viewMode === "2d" && (
          <Workspace
            state={p.state}
            onPatchFourBar={p.onPatchFourBar}
            onPatchSlider={p.onPatchSlider}
            onSetTheta2={p.onSetTheta2}
          />
        )}
        {p.viewMode === "3d" && (
          <Suspense fallback={<Fallback label="loading 3D view…" />}>
            <ThreeView state={p.state} onSetTheta2={p.onSetTheta2} />
          </Suspense>
        )}
        {isCad &&
          (p.state.cadModel ? (
            <Suspense fallback={<Fallback label="building CAD model…" />}>
              <CadView model={p.state.cadModel} />
            </Suspense>
          ) : (
            <Fallback label="No CAD model yet — ask the agent to generate one." />
          ))}
      </div>

      {p.plotsOpen && !isCad && (
        <div className="hidden flex-shrink-0 border-t border-line sm:block">
          <Plots state={p.state} />
        </div>
      )}
    </div>
  );
}
