// Which agent actions need the engineer's consent, and what became of the ones that asked.
//
// The agent proposes; the human decides. `isMutating` draws that line — everything on the
// true side changes the workspace and therefore waits for Apply. The line is drawn with an
// exhaustive switch on purpose: adding a WorkspaceAction variant later will fail `tsc` here
// until it declares whether it needs consent, so a new action can never slip in ungated.
//
// Kept separate from ai/apply.ts, which stays the single executor and is shared with the
// offline agent. Pure functions only, so this is unit-testable without a DOM.

import type { ApprovalState, ChatMessage, WorkspaceAction } from "./types";

/** True for actions that change workspace state, and so need approval before they land. */
export function isMutating(a: WorkspaceAction): boolean {
  switch (a.type) {
    case "set_mechanism":
    case "set_fourbar":
    case "set_slidercrank":
    case "set_cad":
      return true;
    // Neither of these is a change to consent to: analysis is derived from state and always
    // live, and a generated image already exists inside the message that carries it.
    // (Both labels stay adjacent — a comment between them reads as a deliberate fallthrough.)
    case "run_analysis":
    case "generated_image":
      return false;
  }
}

/**
 * Did this turn's actions actually reach the workspace? Used to decide whether reopening a
 * conversation should reveal the mechanism — a turn whose only proposal was discarded left
 * the workspace exactly as it found it.
 */
export function tookEffect(m: Pick<ChatMessage, "actions" | "approval">): boolean {
  switch (m.approval) {
    case "applied":
    case "auto":
      return true;
    case "pending":
    case "discarded":
    case "superseded":
      return false;
    case undefined:
      // Nothing was ever gated on this turn: it only ran the solver or generated an image,
      // or it predates the approval flow and was applied the moment it arrived.
      return (m.actions?.length ?? 0) > 0;
  }
}

/**
 * Resolve the proposal on the message at `index`. Ignores anything that is not still
 * `pending`, so a double-click, a stale index, or a re-render cannot re-decide a turn.
 * Returns the original array when nothing changed, so React can skip the re-render.
 */
export function markAt(ms: ChatMessage[], index: number, to: ApprovalState): ChatMessage[] {
  if (ms[index]?.approval !== "pending") return ms;
  return ms.map((m, i) => (i === index ? { ...m, approval: to } : m));
}

/**
 * Lapse any outstanding proposal, called when a NEW one arrives — two live "Apply" buttons
 * would be ambiguous about which wins. A turn that merely answered a question leaves the
 * pending proposal alone: it was reasoned from the un-applied state, so it still stands.
 */
export function supersedePending(ms: ChatMessage[]): ChatMessage[] {
  if (!ms.some((m) => m.approval === "pending")) return ms;
  return ms.map((m) => (m.approval === "pending" ? { ...m, approval: "superseded" } : m));
}
