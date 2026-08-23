// Turning a turn's raw WorkspaceActions into the rows a human reads.
//
// Pure logic, kept out of ActivityTrace.tsx so that file exports only components (Fast
// Refresh requires it) and so this can be unit-tested without a DOM.

import { formatDeltaValue, formatValue, paramLabel } from "../../params";
import type { TurnMeta, WorkspaceAction } from "../../ai/types";
import { DEFAULT_UNIT } from "../../units";

export type Kind = WorkspaceAction["type"];

export interface Item {
  kind: Kind;
  /** The label half — plain text. */
  label: string;
  /** The numeric half, rendered in tabular figures. */
  value?: string;
  /** Explanatory line, shown only in the expanded view. */
  detail?: string;
}

/**
 * Flatten a turn's actions into one item per observable change. A parameter action becomes
 * one item *per changed parameter*, so both the chip row and the step list stay at a uniform
 * granularity and the "+N more" cap means something.
 *
 * The length unit is read off the `before` snapshot rather than passed in, so a restored transcript
 * keeps the unit it was written in — and so nothing has to thread a live unit through four layers of
 * chat components to label a row the dock already labelled.
 */
export function buildItems(actions: WorkspaceAction[], before?: TurnMeta["before"]): Item[] {
  const items: Item[] = [];
  const unit = before?.unit ?? DEFAULT_UNIT;

  // Running copies of the pre-turn linkages, so a second action touching the same parameter
  // compares against what the first one left behind rather than the value at the turn's start.
  const running: Record<"set_fourbar" | "set_slidercrank", Record<string, unknown> | undefined> = {
    set_fourbar: before ? { ...before.fourbar } : undefined,
    set_slidercrank: before ? { ...before.slider } : undefined,
  };

  for (const a of actions) {
    const firstRow = items.length;

    switch (a.type) {
      case "set_mechanism":
        // Switching to the mechanism already on screen changes nothing — and since these rows
        // are what the approval card offers to apply, a row here would promise a no-op.
        if (before && before.kind === a.kind) break;
        items.push({ kind: a.type, label: a.kind === "fourbar" ? "four-bar" : "slider-crank" });
        break;

      case "set_fourbar":
      case "set_slidercrank": {
        const snap = running[a.type];
        for (const [key, v] of Object.entries(a.params)) {
          // Params arrive from a model's tool call, so an explicitly-undefined key is possible.
          if (v === undefined) continue;
          const prev = snap?.[key];
          if (snap) snap[key] = v;
          // Agents routinely re-send a parameter at the value it already had — the offline
          // agent echoes the whole linkage before editing it. Reporting those as steps would
          // inflate the count and push the real edits out of the chip row. Comparing
          // *displayed* values means a difference too small to see isn't claimed either.
          // No unit needed for the comparison — it is the same suffix on both sides.
          if (prev !== undefined && formatValue(key, prev) === formatValue(key, v)) continue;
          items.push({ kind: a.type, label: paramLabel(key), value: formatDeltaValue(key, prev, v, unit) });
        }
        break;
      }

      case "run_analysis":
        items.push({
          kind: a.type,
          label: "ran analysis",
          detail:
            "Position, velocity, acceleration and Grashof type: every value from the deterministic solver.",
        });
        break;

      case "set_cad": {
        // Count the dimensions the part leaves editable, so the row says more than a bare
        // name. Read off the action itself — nothing here is inferred about the geometry.
        const n = a.model.params?.length ?? 0;
        items.push({
          kind: a.type,
          label: a.model.name,
          detail: n > 0 ? `${n} editable parameter${n === 1 ? "" : "s"}` : undefined,
        });
        break;
      }

      case "generated_image":
        // No row: the image itself is rendered inline in Thread.tsx with its prompt underneath,
        // so a chip would just repeat it — and an image isn't a change to the workspace.
        break;
    }

    // A note describes its action as a whole, so hang it on the first row that action produced.
    if ("note" in a && a.note && items[firstRow] && !items[firstRow].detail) {
      items[firstRow].detail = a.note;
    }
  }

  return items;
}
