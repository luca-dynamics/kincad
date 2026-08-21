// Right-hand dock: parameter editing + live deterministic results, CADAM-style.
//
// The header is `h-14`, matching the Sidebar brand, the ChatPanel header and TopBar row 1 —
// all four sit in one band across the top of the app.
//
// TWO KINDS OF RESULT, TWO SECTIONS. "Results — live" is instantaneous: every row is evaluated at
// the current θ₂ and re-renders as the crank turns. "Cycle" is aggregated over a whole revolution —
// extrema, means, ranges — and only moves when the geometry does. Keeping the split strict is what
// stops the same quantity appearing twice under two labels, so a cycle figure never belongs above.
//
// "Motion" is where animation speed lives, and it lives here rather than in the toolbar because the
// toolbar could not keep it: TopBar row 1 needs ~520px of fixed chrome, and two labelled sliders need
// ~290px more than the centre panel has at a laptop window — so speed was being hidden exactly where
// most people work. It is set once and then forgotten, which is also why it sits last: nothing you
// watch while the crank turns gets pushed below the fold for it.

import { useMemo } from "react";
import { RotateCcw, PanelRightClose } from "lucide-react";
import {
  analyzeFourBar,
  analyzeSliderCrank,
  degWrapped,
  POOR_TRANSMISSION_DEG,
  type FourBarLinkage,
  type FourBarReport,
  type SliderCrankLinkage,
} from "../engine";
import type { WorkspaceState } from "../state";
import { PARAM_META } from "../params";
import { reportFor } from "../insight";
import { LENGTH_UNITS, perSec, perSec2, type LengthUnit } from "../units";
import type { ViewMode } from "./TopBar";
import type { CadModel } from "../cad/types";
import { CycleFigures } from "./Insights";
import { ParamRow, ParamShell, ResultRow, Section, SegToggle, IconButton } from "./ui";

interface Props {
  state: WorkspaceState;
  viewMode: ViewMode;
  onPatchFourBar: (p: Partial<FourBarLinkage>) => void;
  onPatchSlider: (p: Partial<SliderCrankLinkage>) => void;
  onPatchCad: (key: string, value: number) => void;
  /** Top-level workspace fields — `speed` and `unit`. Named apart from `onPatchCad` on purpose, since
   *  `CadParams` below takes its own `onPatch` and the two are not interchangeable. */
  onPatchState: (p: Partial<WorkspaceState>) => void;
  onResetParams: () => void;
  /**
   * Collapses this dock in the desktop panel group. Absent on mobile, where the dock is a whole tab
   * and there is no group to collapse into. Re-opening is the workspace toolbar's far-right toggle —
   * that one is still on screen once this header isn't.
   */
  onCollapse?: () => void;
}

export default function Panel({
  state,
  viewMode,
  onPatchFourBar,
  onPatchSlider,
  onPatchCad,
  onPatchState,
  onResetParams,
  onCollapse,
}: Props) {
  const isFour = state.kind === "fourbar";
  // In the CAD view, the dock edits the generated part's parameters, not the mechanism.
  const isCad = viewMode === "cad" && !!state.cadModel;

  // ONE report for the whole dock, keyed on the geometry and the input speed rather than on θ₂: a
  // 360-step sweep is far too expensive to redo on every frame of the animation, and the linkage it
  // summarises has not moved. Same reasoning as the memo at the top of Plots.tsx. `reportFor` sweeps
  // at REPORT_STEPS, which is 360 — so these extrema are exactly the ones the plots and the PDF
  // report. ω₂ is in the dep list because ω₄ scales with it and α₄ with its square: drop it and the
  // CYCLE figures freeze at whatever speed was set when the geometry last changed.
  const rep = useMemo(
    () => reportFor({ kind: state.kind, fourbar: state.fourbar, slider: state.slider }, state.omega2),
    [state.kind, state.fourbar, state.slider, state.omega2],
  );

  return (
    <div className="flex h-full w-full flex-col border-l border-line bg-panel">
      <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-4">
        <span className="text-head font-semibold tracking-tight text-fg">Parameters</span>
        <div className="flex flex-shrink-0 items-center gap-1">
          <IconButton title="Reset parameters" onClick={onResetParams}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
          {onCollapse && (
            // "Collapse", not "Hide" — the toolbar's toggle owns the Hide/Show wording, and two
            // buttons with the same name doing different things is a trap for anyone reading titles.
            <IconButton title="Collapse parameters" onClick={onCollapse}>
              <PanelRightClose className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isCad ? (
          <CadParams model={state.cadModel!} onPatch={onPatchCad} />
        ) : (
          <>
            {/* `count` is the number of numeric dimensions, so neither the circuit toggle nor the
                unit selector below is counted — same reason: they are not lengths. */}
            <Section title="Dimensions" count={isFour ? 6 : 3}>
              {/* First, because it declares what every number under it means. Switching it rescales
                  NOTHING — the solver is scale-free and never reads it, so 4 stays 4 and the
                  mechanism on screen does not move. See units.ts. */}
              <ParamShell
                label="Length unit"
                title="Unit these dimensions are declared in — a label, not a conversion"
              >
                <SegToggle
                  value={state.unit}
                  options={LENGTH_UNITS.map((u) => ({ value: u, label: u }))}
                  onChange={(unit) => onPatchState({ unit })}
                />
              </ParamShell>
              {isFour ? (
                <FourBarParams link={state.fourbar} unit={state.unit} onPatch={onPatchFourBar} />
              ) : (
                <SliderParams link={state.slider} unit={state.unit} onPatch={onPatchSlider} />
              )}
            </Section>

            <div className="my-3.5 border-t border-line" />

            {/* Narrowing on `rep.kind` rather than `isFour`: it is the same discriminant, but this
                way the report handed to `FourBarResults` is typed as a four-bar report. */}
            <Section title="Results — live">
              {rep.kind === "fourbar" ? <FourBarResults state={state} rep={rep} /> : <SliderResults state={state} />}
            </Section>

            <div className="my-3.5 border-t border-line" />

            <Section title="Cycle">
              <CycleFigures report={rep} unit={state.unit} />
            </Section>

            <div className="my-3.5 border-t border-line" />

            {/* Playback, not geometry — it changes nothing the engine computes, so it sits below
                the figures rather than beside the dimensions that feed them. */}
            <Section title="Motion">
              <ParamRow
                label="Speed"
                value={state.speed}
                min={0.1}
                max={3}
                step={0.1}
                unit="×"
                decimals={1}
                onChange={(v) => onPatchState({ speed: v })}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function CadParams({ model, onPatch }: { model: CadModel; onPatch: (key: string, value: number) => void }) {
  const params = model.params ?? [];
  return (
    <>
      <Section title="Part">
        <ResultRow k="Name" v={model.name} accent="var(--accent)" />
        <ResultRow k="Parameters" v={String(params.length)} />
      </Section>

      <div className="my-3.5 border-t border-line" />

      <Section title="Dimensions" count={params.length}>
        {params.length === 0 ? (
          <p className="text-meta text-muted">This part has no editable parameters.</p>
        ) : (
          params.map((p) => (
            <ParamRow
              key={p.key}
              label={p.label}
              value={p.value}
              min={p.min ?? 0}
              max={p.max ?? Math.max(p.value * 3, p.value + 10)}
              step={p.step ?? 0.5}
              unit={p.unit ?? "mm"}
              decimals={1}
              onChange={(v) => onPatch(p.key, v)}
            />
          ))
        )}
      </Section>
    </>
  );
}

function FourBarParams({
  link,
  unit,
  onPatch,
}: {
  link: FourBarLinkage;
  unit: LengthUnit;
  onPatch: (p: Partial<FourBarLinkage>) => void;
}) {
  // Labels, units and precision come from PARAM_META so the dock and the chat's activity
  // trace can never describe the same parameter differently. Ranges stay here — they're a
  // dock concern, not a labelling one. The length rows carry the declared unit; the angle row
  // carries its own, which never changes.
  const P = PARAM_META;
  const angle = P.couplerPointAngle;
  return (
    <>
      <ParamRow label={P.ground.label} value={link.ground} min={0.5} max={10} unit={unit} onChange={(v) => onPatch({ ground: v })} />
      <ParamRow label={P.input.label} value={link.input} min={0.2} max={8} unit={unit} onChange={(v) => onPatch({ input: v })} />
      <ParamRow label={P.coupler.label} value={link.coupler} min={0.2} max={10} unit={unit} onChange={(v) => onPatch({ coupler: v })} />
      <ParamRow label={P.output.label} value={link.output} min={0.2} max={10} unit={unit} onChange={(v) => onPatch({ output: v })} />
      <ParamRow
        label={P.couplerPointDist.label}
        value={link.couplerPointDist}
        min={0}
        max={8}
        unit={unit}
        onChange={(v) => onPatch({ couplerPointDist: v })}
      />
      <ParamRow
        label={angle.label}
        value={angle.toDisplay(link.couplerPointAngle)}
        min={-180}
        max={180}
        step={1}
        unit={angle.unit}
        decimals={angle.decimals}
        onChange={(v) => onPatch({ couplerPointAngle: angle.toStored(v) })}
      />
      <ParamShell label={P.circuit.label}>
        <SegToggle
          value={link.circuit}
          options={[
            { value: "open", label: "Open" },
            { value: "crossed", label: "Crossed" },
          ]}
          onChange={(c) => onPatch({ circuit: c })}
        />
      </ParamShell>
    </>
  );
}

function SliderParams({
  link,
  unit,
  onPatch,
}: {
  link: SliderCrankLinkage;
  unit: LengthUnit;
  onPatch: (p: Partial<SliderCrankLinkage>) => void;
}) {
  const P = PARAM_META;
  return (
    <>
      <ParamRow label={P.crank.label} value={link.crank} min={0.2} max={6} unit={unit} onChange={(v) => onPatch({ crank: v })} />
      <ParamRow label={P.rod.label} value={link.rod} min={0.5} max={12} unit={unit} onChange={(v) => onPatch({ rod: v })} />
      <ParamRow label={P.offset.label} value={link.offset} min={-4} max={4} unit={unit} onChange={(v) => onPatch({ offset: v })} />
    </>
  );
}

/**
 * Colour for a transmission-angle readout, derived from the ONE threshold the engine publishes
 * rather than from numbers invented here: amber below the guideline, red at three quarters of it.
 * The bands used to be hardcoded at 30°/45°, so the live readout and the cycle figures disagreed
 * about where "poor" begins while displaying the same quantity — now visibly so, since the two sit
 * in one scroll.
 */
function band(mu: number, poorBelowDeg: number) {
  if (!isFinite(mu) || mu < poorBelowDeg * 0.75) return "var(--bad)";
  if (mu < poorBelowDeg) return "var(--warn)";
  return "var(--good)";
}

function FourBarResults({ state, rep }: { state: WorkspaceState; rep: FourBarReport }) {
  const st = analyzeFourBar(state.fourbar, state.theta2, state.omega2);
  return (
    <>
      {/* The classification off the report, not a second `classifyGrashof` call: one sweep, one
          answer, so this row and the Cycle section can never disagree about the mechanism. */}
      <ResultRow k="Type" v={rep.grashof.type} accent="var(--accent)" />
      <ResultRow k="θ₂ input" v={`${fmtDeg(st.theta2)}°`} />
      <ResultRow k="θ₃ coupler" v={st.valid ? `${fmtDeg(st.theta3)}°` : "—"} />
      <ResultRow k="θ₄ output" v={st.valid ? `${fmtDeg(st.theta4)}°` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      <ResultRow k="ω₃" v={st.valid ? `${st.omega3.toFixed(2)} rad/s` : "—"} />
      <ResultRow k="ω₄" v={st.valid ? `${st.omega4.toFixed(2)} rad/s` : "—"} />
      {/* α carries its unit for the same reason ω does: these two rows read as bare numbers
          otherwise, and rad/s² is not guessable from a row labelled α₃. */}
      <ResultRow k="α₃" v={st.valid ? `${st.alpha3.toFixed(2)} rad/s²` : "—"} />
      <ResultRow k="α₄" v={st.valid ? `${st.alpha4.toFixed(2)} rad/s²` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      {/* Instantaneous μ only. The cycle's μ min / max / mean are in the Cycle section below, at the
          resolution the sweep actually produced — this row used to restate them as a rounded range,
          which read as two different answers for one quantity. */}
      <ResultRow
        k="Transmission μ"
        v={st.valid ? `${st.transmissionAngle.toFixed(1)}°` : "—"}
        accent={band(st.transmissionAngle, rep.transmission.poorBelowDeg)}
      />
      <ResultRow k="Mech. advantage" v={st.valid && isFinite(st.mechanicalAdvantage) ? st.mechanicalAdvantage.toFixed(2) : "∞"} />
      <ResultRow
        k="Assembly"
        v={st.valid ? "valid" : "unreachable"}
        accent={st.valid ? "var(--good)" : "var(--bad)"}
      />
    </>
  );
}

function SliderResults({ state }: { state: WorkspaceState }) {
  const st = analyzeSliderCrank(state.slider, state.theta2, state.omega2);
  const u = state.unit;
  return (
    <>
      <ResultRow k="θ₂ crank" v={`${fmtDeg(st.theta2)}°`} />
      <ResultRow k="θ₃ rod" v={st.valid ? `${fmtDeg(st.theta3)}°` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      {/* These three are the workspace's only linear quantities, so they are where the declared
          unit does the most work — they used to print as bare numbers. */}
      <ResultRow k="Slider x" v={st.valid ? `${st.sliderPos.toFixed(3)} ${u}` : "—"} accent="var(--accent)" />
      <ResultRow k="Slider v" v={st.valid ? `${st.sliderVel.toFixed(3)} ${perSec(u)}` : "—"} />
      <ResultRow k="Slider a" v={st.valid ? `${st.sliderAcc.toFixed(3)} ${perSec2(u)}` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      {/* Stroke and "crank rotates" were here, but both are properties of the whole cycle rather
          than of where the crank happens to be — they live in the Cycle section now. That leaves
          this component with no need for a report at all, so it no longer sweeps one.

          The slider-crank report applies the same transmission guideline internally but doesn't
          publish it, so the band reads the engine's constant directly. */}
      <ResultRow
        k="Transmission μ"
        v={st.valid ? `${st.transmissionAngle.toFixed(1)}°` : "—"}
        accent={band(st.transmissionAngle, POOR_TRANSMISSION_DEG)}
      />
    </>
  );
}

function fmtDeg(rad: number) {
  return degWrapped(rad).toFixed(1);
}
