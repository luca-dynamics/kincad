// The workspace toolbar: panel toggles, view tabs, transport controls, the θ₂ scrub, and the exports.
//
// Row 1 is `h-14` — the same 56px as the Sidebar brand, the ChatPanel header and the Params dock
// header. All four sit in one horizontal band across the top of the app, so any other value here
// visibly steps the centre column out of line with the docks flanking it.
//
// IT GATES ON ITS OWN WIDTH, NOT THE VIEWPORT. This toolbar renders inside a resizable panel, so a
// `lg:`/`sm:` prefix here asks the wrong question: at a 1362px window every control meant for
// ≥1024px was rendering into a 649px column, and because the row is `overflow-hidden` the θ₂ block —
// the only `flex-1` child — absorbed the whole shortfall and collapsed to 11px. The `@container` on
// the root measures the panel instead. (Steps: @xl 576 · @2xl 672 · @3xl 768 · @4xl 896.)
//
// ONE ROW FROM @xl UP. The first cut of that fix put θ₂ inline at @2xl (672px) while the secondary
// group was ALSO inline from @xl, and row 1's content at that width is ~724px — so a ~700px centre
// panel crushed the scrub all over again, one breakpoint higher. The order is now strictly by width:
//
//   always      panel toggles · view tabs (icons only below @3xl) · play/pause · reset · export
//   @xl  576px  θ₂ goes inline; below this it keeps its own full-width row
//   @2xl 672px  the export button gets its label back
//   @3xl 768px  the view tabs get their labels back
//   @4xl 896px  grid · coupler · plots · PNG come out of the ⋯ menu and go inline; ⋯ disappears
//
// Budget per step: ~437px of fixed chrome at @xl leaves ~139px for θ₂ (its floor is ~124px); ~641px
// at @3xl absorbs the tab labels; ~826px at @4xl absorbs the secondary group.
//
// Row 2 survives ONLY below @xl — a phone. At 375px row 1 has ~71px left for the scrub after the
// tabs, play, ⋯ and export, well under that 124px floor, and on a phone the scrub is the primary
// control with only one panel on screen. 38px of header for a full-width track is the right trade.
//
// THE SECONDARY CONTROLS ARE DECLARED ONCE. `secondary` below is mapped twice — into IconButtons in
// the @4xl group and into MenuItems in the ⋯ popover — so the two copies cannot drift in wording,
// condition or active state. Before the menu existed those four controls simply vanished below @xl
// with no other home, which meant grid, coupler curve and PNG were unreachable on a phone.
//
// THE PANEL TOGGLES NEVER GO IN THE MENU. When a dock is collapsed its toggle here is the only route
// back, so it has to be visible rather than one click deep — and it sits on the side it acts on.
//
// The animation-speed slider is NOT here any more, it is the Params dock's "Motion" section. Row 1's
// fixed chrome plus two labelled sliders needs ~290px more than a 701px centre panel has — so
// keeping speed here meant hiding it at the width most people actually work at.

import {
  Play,
  Pause,
  RotateCcw,
  Grid3x3,
  Spline,
  Download,
  ImageDown,
  FileText,
  Box,
  Square,
  LineChart,
  Boxes,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { WorkspaceState } from "../state";
import { MESH_FORMATS, type MeshFormat } from "../cad/export";
import { Button, IconButton, MenuItem, Popover } from "./ui";

export type ViewMode = "2d" | "3d" | "cad";

/**
 * Collapse wiring for the two docks flanking this panel. Absent on mobile, where one panel fills the
 * screen and there is no neighbour to collapse — see the `panels` prop in App.tsx.
 */
export interface PanelToggles {
  chatCollapsed: boolean;
  paramsCollapsed: boolean;
  onToggleChat: () => void;
  onToggleParams: () => void;
}

/** One secondary control, rendered inline at @4xl and as a menu row below it. */
interface Secondary {
  key: string;
  /** Menu wording — a full phrase, because a menu row carries no tooltip. */
  label: string;
  /** Tooltip for the inline copy. */
  title: string;
  icon: React.ReactNode;
  /** Set when the inline copy should be a labelled `Button` rather than a bare `IconButton`. */
  inlineLabel?: string;
  active?: boolean;
  onClick: () => void;
}

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
  /** The CAD view's geometry export. One handler, one format argument — see [export.ts](../cad/export.ts). */
  onExportModel: (format: MeshFormat) => void;
  panels?: PanelToggles;
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
  onExportModel,
  panels,
}: Props) {
  const isCad = viewMode === "cad";
  const deg = (((state.theta2 * 180) / Math.PI) % 360 + 360) % 360;

  const tab = (mode: ViewMode, active: boolean, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => onSetViewMode(mode)}
      title={label}
      // py-2.5 below `sm`: these three switch the whole canvas and are the most-tapped control on
      // a phone, so they get a 37px box there and fall back to 29px under a mouse.
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-meta transition-colors sm:py-1.5 ${
        active ? "bg-accent/15 font-medium text-accent shadow-raise" : "text-muted hover:text-fg"
      }`}
    >
      {icon}
      {/* Hidden, not shortened: a `display:none` label takes its flex gap with it, which is where
          ~56px of the three tabs' width goes below @3xl. The `title` above keeps them named. */}
      <span className="hidden @3xl:inline">{label}</span>
    </button>
  );

  /** 2D / 3D / CAD tab pill — shared between both layouts */
  const viewTabs = (
    <div className="flex flex-shrink-0 gap-0.5 rounded-xl bg-panel-2 p-0.5 ring-1 ring-line">
      {tab("2d", viewMode === "2d", <Square className="h-3.5 w-3.5" />, "2D")}
      {tab("3d", viewMode === "3d", <Box className="h-3.5 w-3.5" />, "3D")}
      {hasCad && tab("cad", isCad, <Boxes className="h-3.5 w-3.5" />, "CAD")}
    </div>
  );

  /**
   * Primary export button — the one action that is inline at every width.
   *
   * In CAD it is a *menu*, because the part is a triangle mesh and three formats are worth offering
   * for it with no single default that is right for every use: STL for a slicer, OBJ for a CAD or
   * modelling package, GLB for a viewer. STL stays the visible label since printing is the common
   * case. Before a model exists there is no geometry to export, so the report takes the slot back.
   */
  const exportBtn =
    isCad && hasCad ? (
      <Popover
        variant="primary"
        label="Export the model geometry"
        trigger={
          <>
            <Download className="h-4 w-4" />
            <span className="hidden @2xl:inline">STL</span>
          </>
        }
      >
        {MESH_FORMATS.map((f) => (
          <MenuItem
            key={f.id}
            icon={<Download className="h-4 w-4" />}
            label={`${f.label}: ${f.hint}`}
            onClick={() => onExportModel(f.id)}
          />
        ))}
      </Popover>
    ) : (
      <Button variant="primary" onClick={onExportPDF} title="Download report PDF">
        <Download className="h-4 w-4" />
        <span className="hidden @2xl:inline">Report</span>
      </Button>
    );

  /** A dock toggle. `PanelLeftOpen`/`PanelRightOpen` point outward — the direction the dock returns from. */
  const panelToggle = (side: "left" | "right") => {
    if (!panels) return null;
    const collapsed = side === "left" ? panels.chatCollapsed : panels.paramsCollapsed;
    const what = side === "left" ? "chat panel" : "parameters";
    const Icon =
      side === "left"
        ? collapsed
          ? PanelLeftOpen
          : PanelLeftClose
        : collapsed
          ? PanelRightOpen
          : PanelRightClose;
    return (
      <IconButton
        title={`${collapsed ? "Show" : "Hide"} the ${what}`}
        onClick={side === "left" ? panels.onToggleChat : panels.onToggleParams}
      >
        <Icon className="h-4 w-4" />
      </IconButton>
    );
  };

  // The single declaration the inline group and the ⋯ menu are both built from. Pushed rather than
  // filtered so each entry's condition sits next to it and nothing needs casting back off `false`.
  const secondary: Secondary[] = [];
  if (viewMode === "2d") {
    secondary.push({
      key: "grid",
      label: "Grid",
      title: "Toggle grid",
      icon: <Grid3x3 className="h-4 w-4" />,
      active: state.showGrid,
      onClick: () => onPatch({ showGrid: !state.showGrid }),
    });
  }
  // Every view, not just 2D. The capture is view-agnostic now — `activeViewCanvas()` finds whichever
  // canvas is mounted inside the shared surface container, so 3D and CAD download what is on screen
  // exactly as 2D does. (This button was gated to 2D because the old handler looked up `#cad-canvas`,
  // an id only the 2D canvas carries, so the click did nothing at all in the other two views.)
  // Withheld only in CAD before a model is built, where there is no canvas to read.
  if (!isCad || hasCad) {
    secondary.push({
      key: "png",
      label: "Download PNG",
      title: "Download the view as a PNG",
      icon: <ImageDown className="h-4 w-4" />,
      inlineLabel: "PNG",
      onClick: onExportPNG,
    });
  }
  if (state.kind === "fourbar" && !isCad) {
    secondary.push({
      key: "coupler",
      label: "Coupler curve",
      title: "Toggle coupler curve",
      icon: <Spline className="h-4 w-4" />,
      active: state.showCouplerCurve,
      onClick: () => onPatch({ showCouplerCurve: !state.showCouplerCurve }),
    });
  }
  if (!isCad) {
    secondary.push({
      key: "plots",
      label: "Plots",
      title: "Toggle plots",
      icon: <LineChart className="h-4 w-4" />,
      active: plotsOpen,
      onClick: onTogglePlots,
    });
  }
  // The CAD view's document. It lives here rather than in the primary slot because the geometry menu
  // holds that slot — and being a `secondary` entry is what makes it reachable on a phone too, via ⋯.
  if (isCad && hasCad) {
    secondary.push({
      key: "sheet",
      label: "Part sheet PDF",
      title: "Download the part sheet PDF",
      icon: <FileText className="h-4 w-4" />,
      inlineLabel: "Sheet",
      onClick: onExportPDF,
    });
  }

  const theta2Input = (className: string) => (
    <input
      type="range"
      min={0}
      max={360}
      step={1}
      value={deg}
      onChange={(e) => onPatch({ playing: false, theta2: (parseFloat(e.target.value) * Math.PI) / 180 })}
      className={className}
      aria-label="Input angle θ₂"
    />
  );

  return (
    <div className="@container flex-shrink-0 border-b border-line bg-panel">
      {/* ── Row 1 ── */}
      <div className="flex h-14 items-center gap-2 overflow-hidden px-3">
        {panelToggle("left")}

        {viewTabs}

        <div className="mx-0.5 h-5 w-px flex-shrink-0 bg-line" />

        <IconButton title={state.playing ? "Pause" : "Play"} onClick={onTogglePlay} active={state.playing}>
          {state.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconButton>
        <IconButton title="Reset" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>

        {/* θ₂ — the only `flex-1` child, so it is also what absorbs any shortfall. That is why it
            waits for @xl and drops to row 2 below it rather than being squeezed to nothing. */}
        <div className="hidden min-w-0 flex-1 items-center gap-2.5 @xl:flex">
          <span className="flex-shrink-0 text-mini text-faint">θ₂</span>
          {theta2Input("min-w-0 max-w-32 flex-1")}
          <span className="num w-10 flex-shrink-0 text-mini text-muted">{deg.toFixed(0)}°</span>
        </div>

        {/* Takes over pushing the exports right whenever θ₂ isn't inline to do it. */}
        <div className="flex-1 @xl:hidden" />

        {secondary.length > 0 && (
          <div className="hidden flex-shrink-0 items-center gap-1 @4xl:flex">
            <div className="mx-0.5 h-5 w-px bg-line" />
            {secondary.map((c) =>
              c.inlineLabel ? (
                <Button key={c.key} onClick={c.onClick} title={c.title}>
                  {c.icon} {c.inlineLabel}
                </Button>
              ) : (
                <IconButton key={c.key} title={c.title} onClick={c.onClick} active={c.active}>
                  {c.icon}
                </IconButton>
              ),
            )}
          </div>
        )}

        {secondary.length > 0 && (
          <Popover
            label="More view controls"
            trigger={<MoreHorizontal className="h-4 w-4" />}
            className="@4xl:hidden"
          >
            {secondary.map((c) => (
              <MenuItem key={c.key} icon={c.icon} label={c.label} active={c.active} onClick={c.onClick} />
            ))}
          </Popover>
        )}

        {exportBtn}

        {panelToggle("right")}
      </div>

      {/* ── Row 2: full-width θ₂, below @xl only ──
          The 20px hit area is built into the input itself (index.css) — padding here would inflate
          the track, not the target. */}
      <div className="flex items-center gap-2.5 px-3 pb-2.5 @xl:hidden">
        <span className="flex-shrink-0 text-mini text-faint">θ₂</span>
        {theta2Input("min-w-0 flex-1")}
        <span className="num w-10 flex-shrink-0 text-right text-mini text-muted">{deg.toFixed(0)}°</span>
      </div>
    </div>
  );
}
