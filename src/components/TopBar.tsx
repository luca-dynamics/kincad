import { Play, Pause, RotateCcw, Grid3x3, Spline, Download, ImageDown, Box, Square, LineChart, Boxes } from "lucide-react";
import type { WorkspaceState } from "../state";
import { IconButton } from "./ui";

export type ViewMode = "2d" | "3d" | "cad";

interface Props {
  state: WorkspaceState;
  viewMode: ViewMode;
  onSetViewMode: (m: ViewMode) => void;
  hasCad: boolean;
  plotsOpen: boolean;
  onTogglePlots: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onPatch: (p: Partial<WorkspaceState>) => void;
  onExportPDF: () => void;
  onExportPNG: () => void;
  onExportSTL: () => void;
}

export default function TopBar({
  state,
  viewMode,
  onSetViewMode,
  hasCad,
  plotsOpen,
  onTogglePlots,
  onTogglePlay,
  onReset,
  onPatch,
  onExportPDF,
  onExportPNG,
  onExportSTL,
}: Props) {
  const isCad = viewMode === "cad";
  const deg = (((state.theta2 * 180) / Math.PI) % 360 + 360) % 360;
  return (
    <div className="flex h-12 flex-shrink-0 items-center gap-2 overflow-hidden border-b border-line bg-panel px-3">
      {/* 2D / 3D mode */}
      <div className="flex flex-shrink-0 gap-0.5 rounded-lg bg-panel-2 p-0.5 ring-1 ring-line">
        <button
          onClick={() => onSetViewMode("2d")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${viewMode === "2d" ? "bg-accent/15 font-medium text-accent" : "text-muted hover:text-fg"}`}
        >
          <Square className="h-3.5 w-3.5" /> 2D
        </button>
        <button
          onClick={() => onSetViewMode("3d")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${viewMode === "3d" ? "bg-accent/15 font-medium text-accent" : "text-muted hover:text-fg"}`}
        >
          <Box className="h-3.5 w-3.5" /> 3D
        </button>
        {hasCad && (
          <button
            onClick={() => onSetViewMode("cad")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${isCad ? "bg-accent/15 font-medium text-accent" : "text-muted hover:text-fg"}`}
          >
            <Boxes className="h-3.5 w-3.5" /> CAD
          </button>
        )}
      </div>

      <div className="mx-0.5 h-5 w-px flex-shrink-0 bg-line" />

      {/* transport — shrinks first so the export buttons are never clipped */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <IconButton title={state.playing ? "Pause" : "Play"} onClick={onTogglePlay} active={state.playing}>
          {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconButton>
        <IconButton title="Reset" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-shrink-0 text-[11px] text-faint">θ₂</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={deg}
            onChange={(e) => onPatch({ playing: false, theta2: (parseFloat(e.target.value) * Math.PI) / 180 })}
            className="min-w-0 max-w-28 flex-1"
          />
          <span className="num w-9 flex-shrink-0 text-[11px] text-muted">{deg.toFixed(0)}°</span>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <span className="text-[11px] text-faint">speed</span>
          <input type="range" min={0.1} max={3} step={0.1} value={state.speed} onChange={(e) => onPatch({ speed: parseFloat(e.target.value) })} className="w-16" />
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1.5">
        {viewMode === "2d" && (
          <IconButton title="Toggle grid" onClick={() => onPatch({ showGrid: !state.showGrid })} active={state.showGrid}>
            <Grid3x3 className="h-4 w-4" />
          </IconButton>
        )}
        {state.kind === "fourbar" && !isCad && (
          <IconButton title="Toggle coupler curve" onClick={() => onPatch({ showCouplerCurve: !state.showCouplerCurve })} active={state.showCouplerCurve}>
            <Spline className="h-4 w-4" />
          </IconButton>
        )}
        {!isCad && (
          <IconButton title="Toggle plots" onClick={onTogglePlots} active={plotsOpen}>
            <LineChart className="h-4 w-4" />
          </IconButton>
        )}
        <div className="mx-0.5 h-5 w-px bg-line" />
        <button onClick={onExportPNG} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-line hover:text-fg">
          <ImageDown className="h-4 w-4" /> PNG
        </button>
        {isCad ? (
          <button onClick={onExportSTL} className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90">
            <Download className="h-4 w-4" /> STL
          </button>
        ) : (
          <button onClick={onExportPDF} className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90">
            <Download className="h-4 w-4" /> Report
          </button>
        )}
      </div>
    </div>
  );
}
