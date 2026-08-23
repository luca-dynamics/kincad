// The "agent activity" surface — one concept (what the agent did on this turn) rendered
// in four states:
//
//   <AgentActivity>   live, while the turn is still in flight
//   <ProposalCard>    the changes it wants to make, awaiting Apply or Discard
//   <TurnTrace>       collapsed summary chips once it lands …
//                     … and expanded, the ordered step-by-step detail
//
// HONESTY RULE. The server-side tool loop in server/providers.ts accumulates its rounds and
// returns only after the whole loop finishes, so the client has no per-step signal while it
// waits. The live loader therefore shows ONLY what is genuinely known — which model is
// answering, and how long it has really been running. The step detail is *retrospective*,
// built from the actions the turn actually returned. We never narrate a stage we cannot
// observe: inventing progress would be the UI equivalent of inventing a number.
//
// The same rule governs the proposal card. Its rows are diffed against the CURRENT workspace,
// not against a snapshot taken when the turn ran, so it always states what Apply would do right
// now. And it never claims the workspace has moved: until the button is pressed, it hasn't.

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Box,
  Check,
  ChevronDown,
  Cog,
  Image as ImageIcon,
  Shapes,
  SlidersHorizontal,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { buildItems, type Item, type Kind } from "./activity";
import { isMutating } from "../../ai/approval";
import { applyActions } from "../../ai/apply";
import { compareMetrics, reportFor, warningDelta } from "../../insight";
import { DEFAULT_OMEGA2 } from "../../state";
import { DEFAULT_UNIT } from "../../units";
import { MetricDelta } from "../Insights";
import { Button, Card, CardHead } from "../ui";
import type { ApprovalState, TurnMeta, WorkspaceAction } from "../../ai/types";

/** Chips shown before the row collapses into a "+N more" affordance. */
const MAX_CHIPS = 3;
/** How long a turn must run before we mention that a reply can take several solver rounds. */
const SLOW_AFTER_MS = 12_000;

const ICON: Record<Kind, LucideIcon> = {
  set_mechanism: Shapes,
  set_fourbar: SlidersHorizontal,
  set_slidercrank: SlidersHorizontal,
  run_analysis: Activity,
  set_cad: Box,
  generated_image: ImageIcon,
};

/** Chip treatment: background + text. The solver getting run is the one thing worth its own colour. */
const TONE: Record<Kind, string> = {
  set_mechanism: "bg-accent/10 text-accent",
  set_fourbar: "bg-accent/10 text-accent",
  set_slidercrank: "bg-accent/10 text-accent",
  run_analysis: "bg-good/10 text-good",
  set_cad: "bg-accent/10 text-accent",
  generated_image: "bg-line text-muted",
};

/** Step-row treatment: icon colour only. */
const INK: Record<Kind, string> = {
  set_mechanism: "text-accent",
  set_fourbar: "text-accent",
  set_slidercrank: "text-accent",
  run_analysis: "text-good",
  set_cad: "text-accent",
  generated_image: "text-muted",
};

/**
 * Actions that move the linkage. Narrower than `isMutating`, which also covers `set_cad`: a
 * generated part changes the workspace but has no kinematic consequence, so there is nothing
 * honest to state about what applying it would do to the cycle.
 */
function movesGeometry(a: WorkspaceAction): boolean {
  return a.type === "set_mechanism" || a.type === "set_fourbar" || a.type === "set_slidercrank";
}

// ── Live loader ──────────────────────────────────────────────────────────────────────

/**
 * Shown while a turn is in flight. `modelLabel` comes from the live model selection, so if
 * the quota auto-fallback swaps models mid-turn this label follows it — the loader always
 * names the model that is actually running.
 */
export function AgentActivity({ modelLabel }: { modelLabel: string }) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setMs(Date.now() - t0), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="kc-pop flex flex-col gap-1 px-1 py-0.5">
      <div className="flex items-center gap-2 text-mini">
        <Cog
          className="h-3.5 w-3.5 animate-spin text-accent motion-reduce:animate-none"
          style={{ animationDuration: "2.4s" }}
        />
        <span className="kc-shimmer font-medium">{modelLabel}</span>
        <span className="num text-faint">{(ms / 1000).toFixed(1)}s</span>
      </div>
      {ms >= SLOW_AFTER_MS && (
        <p className="kc-step pl-[22px] text-micro text-faint">
          running engine tools (one reply can take several solver rounds)
        </p>
      )}
    </div>
  );
}

// ── Proposal, awaiting a decision ────────────────────────────────────────────────────

/**
 * The changes a turn wants to make, and the two buttons that decide them. Rows come from the
 * same `buildItems` the retrospective trace uses, so what the card lists is exactly what Apply
 * will do — diffed against `current`, the live workspace, rather than a stale snapshot.
 *
 * Only mutating actions are listed. A `run_analysis` in the same turn already ran, server-side,
 * against the proposed geometry — so it is not something to approve, it is something to
 * disclose, which the footer does.
 *
 * Below the rows, what those numbers would *do*: the card solves the proposed geometry and states
 * the change in the headline cycle figures before you commit. Both halves of that are existing
 * pure functions — `applyActions` is the same executor Apply itself runs, and `reportFor` the same
 * report the plots and the PDF read — so the preview cannot disagree with the outcome.
 */
export function ProposalCard({
  actions,
  current,
  onApply,
  onDiscard,
}: {
  actions: WorkspaceAction[];
  current?: TurnMeta["before"];
  onApply: () => void;
  onDiscard: () => void;
}) {
  const changes = useMemo(() => actions.filter(isMutating), [actions]);
  const items = useMemo(() => buildItems(changes, current), [changes, current]);
  const ranAnalysis = actions.some((a) => a.type === "run_analysis");
  // The live diff can empty out — the user may have made these same edits by hand in the dock
  // while the proposal sat here. Say so instead of offering an Apply that would do nothing.
  const moot = items.length === 0;

  // Two full 360-step sweeps, so this is memoized on the live geometry. `current` is memoized in
  // App.tsx for the same reason: θ₂ ticks at 60 Hz and must not drag two reports along with it.
  // Both sweeps run at the speed the turn was taken at, so these figures match what the dock and
  // the plots showed at the time; a conversation saved before ω₂ was recorded falls back to the
  // workspace default rather than to the engine's unit-rate 1 rad/s.
  const outcome = useMemo(() => {
    if (!current || !changes.some(movesGeometry)) return null;
    const omega2 = current.omega2 ?? DEFAULT_OMEGA2;
    const before = reportFor(current, omega2);
    const after = reportFor(applyActions(current, changes), omega2);
    const rows = compareMetrics(before, after, current.unit ?? DEFAULT_UNIT);
    const churn = warningDelta(before, after);
    // A geometry change that moves no published figure — say nothing rather than show an empty
    // heading. The parameter rows above already state what would change.
    if (rows.length === 0 && churn.cleared === 0 && churn.introduced.length === 0) return null;
    return { rows, ...churn };
  }, [current, changes]);

  return (
    <Card tone="accent" className="kc-pop mt-1.5">
      <CardHead title="Proposed" tone="accent">
        {!moot && (
          <span className="num ml-auto text-micro text-faint">
            {items.length} change{items.length === 1 ? "" : "s"}
          </span>
        )}
      </CardHead>

      {moot ? (
        <p className="px-3 py-2 text-mini text-muted">
          The workspace already matches this, so there is nothing left to apply.
        </p>
      ) : (
        <>
          <div className="px-3 py-2">
            {items.map((it, i) => (
              <Step key={i} item={it} index={i} />
            ))}
          </div>

          {outcome && (
            <div className="border-t border-line px-3 py-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-micro font-semibold uppercase tracking-[0.07em] text-muted">
                  If applied
                </span>
                {/* Whose numbers these are. The card states a consequence, so it says who computed it. */}
                <span className="text-micro text-faint">engine · proposed geometry</span>
              </div>
              <div className="mt-1">
                {outcome.rows.map((m, i) => (
                  <MetricDelta key={m.key} metric={m} index={i} />
                ))}
              </div>
              {outcome.cleared > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-micro text-good">
                  <Check className="h-3 w-3 flex-shrink-0" />
                  {outcome.cleared} warning{outcome.cleared === 1 ? "" : "s"} cleared
                </p>
              )}
              {/* The engine's own sentences, verbatim — the card warns you *before* Apply, which
                  is the whole point of showing this. */}
              {outcome.introduced.map((w) => (
                <p key={w} className="mt-1 flex items-start gap-1.5 text-micro text-warn">
                  <TriangleAlert className="mt-[2px] h-3 w-3 flex-shrink-0" />
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}

          <p className="px-3 pb-2 pt-1.5 text-micro text-faint">
            {ranAnalysis
              ? "Figures in this reply were computed by the engine for the proposed geometry, not the one on screen."
              : "The workspace is unchanged until you apply."}
          </p>
        </>
      )}

      <div className="flex items-center justify-end gap-1.5 border-t border-line px-3 py-2">
        <Button onClick={onDiscard}>
          <X className="h-3.5 w-3.5" />
          {moot ? "Dismiss" : "Discard"}
        </Button>
        {!moot && (
          <Button variant="primary" onClick={onApply}>
            <Check className="h-3.5 w-3.5" />
            Apply
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Retrospective trace ──────────────────────────────────────────────────────────────

export function TurnTrace({
  actions,
  meta,
  approval,
}: {
  actions?: WorkspaceAction[];
  meta?: TurnMeta;
  approval?: ApprovalState;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => buildItems(actions ?? [], meta?.before), [actions, meta]);

  if (items.length === 0) return null;

  const chips = items.slice(0, MAX_CHIPS);
  const hidden = items.length - chips.length;
  // Why a proposal never landed. Worth a full sentence: a reader scrolling back needs to know
  // the numbers in this reply describe a geometry that was never built.
  const lapsed =
    approval === "discarded"
      ? "You discarded this, so the workspace was not changed. Any figures in the reply describe the proposed geometry."
      : approval === "superseded"
        ? "Never applied: a later turn proposed different changes instead."
        : null;

  return (
    <div className="mt-1.5">
      {!open && (
        <div className="mb-0.5 flex flex-wrap gap-1.5">
          {chips.map((it, i) => (
            <Chip key={i} item={it} onClick={() => setOpen(true)} />
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setOpen(true)}
              className="kc-pop h-8 rounded-lg bg-line px-2.5 text-mini text-muted transition-colors hover:text-fg sm:h-7"
            >
              +{hidden} more
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-full items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.07em] text-faint transition-colors hover:text-muted sm:h-7"
      >
        <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        <span>
          {/* "steps", not "changes" — running the solver is an item here but isn't a change. */}
          {items.length} step{items.length === 1 ? "" : "s"}
        </span>
        {/* The outcome, stated rather than implied. Dimming the row would be both ambiguous
            and, at this size over --faint, below the contrast floor in the light theme. */}
        {approval === "applied" && <Check className="h-3 w-3 flex-shrink-0 text-good" />}
        {approval === "auto" && <span className="truncate">· applied automatically</span>}
        {lapsed && <span className="flex-shrink-0 text-warn">· not applied</span>}
        {meta && (
          <span className="num ml-auto truncate font-normal normal-case tracking-normal">
            {(meta.elapsedMs / 1000).toFixed(1)}s · {meta.modelLabel}
          </span>
        )}
      </button>

      {open && (
        <Card className="mt-1 px-3 py-2">
          {items.map((it, i) => (
            <Step key={i} item={it} index={i} />
          ))}
          {lapsed && (
            <p className="mt-1.5 border-t border-line pt-1.5 text-micro text-muted">{lapsed}</p>
          )}
          {meta?.fellBackFrom && (
            <p className="mt-1.5 border-t border-line pt-1.5 text-micro text-warn">
              {meta.fellBackFrom} hit its quota, so {meta.modelLabel} answered instead.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

/**
 * Not a `Button`: the chip's whole point is `TONE[kind]`, which sets both background and text
 * colour, and appending those over a variant's own `text-*` is resolved by generated-CSS order
 * rather than class order. So it borrows `Button`'s box metrics — 32px under a thumb, 28px under
 * a mouse — and keeps its own paint.
 */
function Chip({ item, onClick }: { item: Item; onClick: () => void }) {
  const Icon = ICON[item.kind];
  return (
    <button
      onClick={onClick}
      title={item.detail ?? [item.label, item.value].filter(Boolean).join(" ")}
      className={`kc-pop flex h-8 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-mini transition-opacity hover:opacity-75 sm:h-7 ${TONE[item.kind]}`}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.value && <span className="num flex-shrink-0">{item.value}</span>}
    </button>
  );
}

function Step({ item, index }: { item: Item; index: number }) {
  const Icon = ICON[item.kind];
  return (
    <div
      className="kc-step flex items-start gap-2 py-[3px]"
      // `backwards` keeps the row hidden during its stagger delay instead of flashing in first.
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
    >
      <Icon className={`mt-[3px] h-3 w-3 flex-shrink-0 ${INK[item.kind]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-mini text-fg">
          {item.label}
          {item.value && <span className="num ml-1.5 text-muted">{item.value}</span>}
        </p>
        {item.detail && <p className="mt-0.5 text-micro text-faint">{item.detail}</p>}
      </div>
    </div>
  );
}
