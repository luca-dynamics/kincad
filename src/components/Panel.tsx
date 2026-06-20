// Right-hand dock: parameter editing + live deterministic results, CADAM-style.

import { RotateCcw } from "lucide-react";
import {
  analyzeFourBar,
  analyzeSliderCrank,
  buildFourBarReport,
  buildSliderCrankReport,
  classifyGrashof,
  toDeg,
  type FourBarLinkage,
  type SliderCrankLinkage,
} from "../engine";
import type { WorkspaceState } from "../state";
import type { ViewMode } from "./TopBar";
import type { CadModel } from "../cad/types";
import { ParamRow, ResultRow, Section, SegToggle, IconButton } from "./ui";

interface Props {
  state: WorkspaceState;
  viewMode: ViewMode;
  onPatchFourBar: (p: Partial<FourBarLinkage>) => void;
  onPatchSlider: (p: Partial<SliderCrankLinkage>) => void;
  onPatchCad: (key: string, value: number) => void;
  onResetParams: () => void;
}

export default function Panel({ state, viewMode, onPatchFourBar, onPatchSlider, onPatchCad, onResetParams }: Props) {
  const isFour = state.kind === "fourbar";
  // In the CAD view, the dock edits the generated part's parameters, not the mechanism.
  const isCad = viewMode === "cad" && !!state.cadModel;

  return (
    <div className="flex h-full w-full flex-col border-l border-line bg-panel">
      <div className="flex h-14 items-center justify-between border-b border-line px-4">
        <span className="text-sm font-semibold tracking-tight text-fg">Parameters</span>
        <IconButton title="Reset parameters" onClick={onResetParams}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isCad ? (
          <CadParams model={state.cadModel!} onPatch={onPatchCad} />
        ) : (
          <>
            <Section title="Dimensions" count={isFour ? 6 : 3}>
              {isFour ? (
                <FourBarParams link={state.fourbar} onPatch={onPatchFourBar} />
              ) : (
                <SliderParams link={state.slider} onPatch={onPatchSlider} />
              )}
            </Section>

            <div className="my-3.5 border-t border-line" />

            <Section title="Results — live">
              {isFour ? <FourBarResults state={state} /> : <SliderResults state={state} />}
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
          <p className="text-xs text-muted">This part has no editable parameters.</p>
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

function FourBarParams({ link, onPatch }: { link: FourBarLinkage; onPatch: (p: Partial<FourBarLinkage>) => void }) {
  return (
    <>
      <ParamRow label="Ground r₁" value={link.ground} min={0.5} max={10} onChange={(v) => onPatch({ ground: v })} />
      <ParamRow label="Input r₂" value={link.input} min={0.2} max={8} onChange={(v) => onPatch({ input: v })} />
      <ParamRow label="Coupler r₃" value={link.coupler} min={0.2} max={10} onChange={(v) => onPatch({ coupler: v })} />
      <ParamRow label="Output r₄" value={link.output} min={0.2} max={10} onChange={(v) => onPatch({ output: v })} />
      <ParamRow label="Cpl pt dist" value={link.couplerPointDist} min={0} max={8} onChange={(v) => onPatch({ couplerPointDist: v })} />
      <ParamRow
        label="Cpl pt ∠"
        value={toDeg(link.couplerPointAngle)}
        min={-180}
        max={180}
        step={1}
        unit="°"
        decimals={0}
        onChange={(v) => onPatch({ couplerPointAngle: (v * Math.PI) / 180 })}
      />
      <div className="grid grid-cols-[78px_1fr] items-center gap-3">
        <span className="text-xs text-muted">Circuit</span>
        <SegToggle
          value={link.circuit}
          options={[
            { value: "open", label: "Open" },
            { value: "crossed", label: "Crossed" },
          ]}
          onChange={(c) => onPatch({ circuit: c })}
        />
      </div>
    </>
  );
}

function SliderParams({ link, onPatch }: { link: SliderCrankLinkage; onPatch: (p: Partial<SliderCrankLinkage>) => void }) {
  return (
    <>
      <ParamRow label="Crank r₂" value={link.crank} min={0.2} max={6} onChange={(v) => onPatch({ crank: v })} />
      <ParamRow label="Rod r₃" value={link.rod} min={0.5} max={12} onChange={(v) => onPatch({ rod: v })} />
      <ParamRow label="Offset e" value={link.offset} min={-4} max={4} onChange={(v) => onPatch({ offset: v })} />
    </>
  );
}

function band(mu: number) {
  if (!isFinite(mu) || mu < 30) return "var(--bad)";
  if (mu < 45) return "var(--warn)";
  return "var(--good)";
}

function FourBarResults({ state }: { state: WorkspaceState }) {
  const st = analyzeFourBar(state.fourbar, state.theta2, state.omega2);
  const g = classifyGrashof(state.fourbar);
  const rep = buildFourBarReport(state.fourbar, 360);
  return (
    <>
      <ResultRow k="Type" v={g.type} accent="var(--accent)" />
      <ResultRow k="θ₂ input" v={`${fmtDeg(st.theta2)}°`} />
      <ResultRow k="θ₃ coupler" v={st.valid ? `${fmtDeg(st.theta3)}°` : "—"} />
      <ResultRow k="θ₄ output" v={st.valid ? `${fmtDeg(st.theta4)}°` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      <ResultRow k="ω₃" v={st.valid ? `${st.omega3.toFixed(2)} rad/s` : "—"} />
      <ResultRow k="ω₄" v={st.valid ? `${st.omega4.toFixed(2)} rad/s` : "—"} />
      <ResultRow k="α₃" v={st.valid ? st.alpha3.toFixed(2) : "—"} />
      <ResultRow k="α₄" v={st.valid ? st.alpha4.toFixed(2) : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      <ResultRow k="Transmission μ" v={st.valid ? `${st.transmissionAngle.toFixed(1)}°` : "—"} accent={band(st.transmissionAngle)} />
      <ResultRow k="μ range" v={`${rep.transmission.min.value.toFixed(0)}–${rep.transmission.max.value.toFixed(0)}°`} />
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
  const rep = buildSliderCrankReport(state.slider, 360);
  return (
    <>
      <ResultRow k="θ₂ crank" v={`${fmtDeg(st.theta2)}°`} />
      <ResultRow k="θ₃ rod" v={st.valid ? `${fmtDeg(st.theta3)}°` : "—"} />
      <div className="my-1.5 border-t border-line/60" />
      <ResultRow k="Slider x" v={st.valid ? st.sliderPos.toFixed(3) : "—"} accent="var(--accent)" />
      <ResultRow k="Slider v" v={st.valid ? st.sliderVel.toFixed(3) : "—"} />
      <ResultRow k="Slider a" v={st.valid ? st.sliderAcc.toFixed(3) : "—"} />
      <ResultRow k="Stroke" v={rep.stroke.toFixed(3)} />
      <div className="my-1.5 border-t border-line/60" />
      <ResultRow k="Transmission μ" v={st.valid ? `${st.transmissionAngle.toFixed(1)}°` : "—"} accent={band(st.transmissionAngle)} />
      <ResultRow
        k="Crank rotates"
        v={rep.inputFullyRotates ? "fully" : "limited"}
        accent={rep.inputFullyRotates ? "var(--good)" : "var(--warn)"}
      />
    </>
  );
}

function fmtDeg(rad: number) {
  let d = toDeg(rad) % 360;
  if (d < 0) d += 360;
  return d.toFixed(1);
}
