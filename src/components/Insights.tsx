// Cycle-level figures for the right-hand dock: the headline numbers for one full revolution, and
// the engine's own warnings.
//
// These used to render as a wide strip above the plots, which put them directly beneath the 2D
// canvas and cost the workspace ~120px of height — for figures that only move when the geometry
// does. They now sit in the dock under RESULTS — LIVE, which is also the clearer split: that
// section is instantaneous at the current θ₂, everything here is aggregated over the whole cycle.
//
// Those warnings are the reason this component exists. `buildFourBarReport` produces real
// rule-based warnings — a transmission angle below the guideline it publishes, with the exact θ₂
// where that happens, and an input link that cannot complete a revolution — and until now they
// reached only the PDF export (report/pdf.ts) and whatever the AI chose to mention. Nothing on
// screen showed them, which made the most design-relevant output of the solver invisible.
//
// Every figure comes from `metrics()`, which formats a report and nothing more. Nothing here
// computes kinematics and nothing here grades a design: the only tones used are the engine's own
// warning list, and a crossing of the one guideline the report publishes.

import { TriangleAlert } from "lucide-react";
import type { AnalysisReport } from "../engine";
import { metrics, type Metric } from "../insight";
import type { LengthUnit } from "../units";

/** Ink for a guideline crossing. Absent `trend`, a value is just a value. */
const TREND_INK: Record<NonNullable<Metric["trend"]>, string> = {
  "toward-rule": "text-good",
  "away-from-rule": "text-warn",
};

export function CycleFigures({ report, unit }: { report: AnalysisReport; unit: LengthUnit }) {
  // `Grashof` is filtered out here rather than removed from `metrics()`: the dock states the same
  // classification as `Type` a few rows above, but `compareMetrics` still needs the row so the
  // approval card can report a mechanism-type change before you apply it. One fact, two audiences.
  const rows = metrics(report, unit).filter((m) => m.key !== "grashof");
  return (
    <>
      {/* What separates these numbers from the live section directly above. Worth a line: nothing
          else on screen says that these are swept rather than sampled. */}
      <div className="mb-1 text-micro text-faint">
        full revolution · {report.kind === "fourbar" ? "four-bar" : "slider-crank"}
      </div>

      {rows.map((m) => (
        <div key={m.key} className="flex items-start justify-between gap-3 py-[3px]">
          {/* Labels are NOT uppercased: `text-transform` would turn μ into Μ and θ into Θ, which
              read as Latin M and O at this size. */}
          <span className="flex-shrink-0 text-meta text-muted">{m.label}</span>
          <div className="min-w-0 text-right">
            {/* No `trend` ink here — only `compareMetrics` sets that, and only for a before/after
                pair. A standing value is just a value. */}
            <div className="num text-meta text-fg">{m.value}</div>
            {/* Where in the revolution the extremum sits: the one thing a cycle figure knows that
                the instantaneous readout above cannot say. */}
            {m.detail && <div className="text-micro text-faint">{m.detail}</div>}
          </div>
        </div>
      ))}

      {report.warnings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-1.5">
          {report.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-mini text-warn">
              <TriangleAlert className="mt-[2px] h-3 w-3 flex-shrink-0" />
              {/* The engine's wording, verbatim — the same sentence the PDF prints. */}
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * One `before → after` row. Used by the approval card. The arrow and the tone live here so a delta
 * can never be tinted one way in the transcript and another way in the dock.
 */
export function MetricDelta({ metric, index = 0 }: { metric: Metric; index?: number }) {
  return (
    <div
      className="kc-step flex items-start gap-2 py-[2px]"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
    >
      {/* 84px, not 74: at 12px the longest label ("Transmission μ min") needs the extra column
          or every row in the proposal card truncates. */}
      <span className="w-[84px] flex-shrink-0 truncate text-meta text-muted" title={metric.label}>
        {metric.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="num text-meta">
          {metric.from && (
            <>
              <span className="text-faint">{metric.from}</span>
              <span className="mx-1 text-faint">→</span>
            </>
          )}
          <span className={metric.trend ? TREND_INK[metric.trend] : "text-fg"}>{metric.value}</span>
        </p>
        {metric.detail && <p className="mt-0.5 text-mini text-faint">{metric.detail}</p>}
      </div>
    </div>
  );
}
