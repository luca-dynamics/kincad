import { describe, it, expect } from "vitest";
import { buildItems } from "../activity";
import { toRad } from "../../../engine";
import type { TurnMeta, WorkspaceAction } from "../../../ai/types";
import type { CadModel } from "../../../cad/types";

/**
 * No `unit` here, deliberately. `TurnMeta.before` is persisted with the conversation, so every
 * transcript saved before the unit existed reaches `buildItems` shaped exactly like this — and its
 * rows still have to be labelled. This fixture is that path, and `DEFAULT_UNIT` is what it falls
 * back to; `IN_BEFORE` below is the one that proves the declaration is read rather than hardcoded.
 */
const BEFORE: TurnMeta["before"] = {
  kind: "fourbar",
  fourbar: {
    ground: 4,
    input: 1.2,
    coupler: 3.5,
    output: 3,
    couplerPointDist: 2.2,
    couplerPointAngle: toRad(35),
    circuit: "open",
  },
  slider: { crank: 1.2, rod: 4, offset: 0.4 },
};

/** The same turn, from a workspace that had declared inches when it was written. */
const IN_BEFORE: TurnMeta["before"] = { ...BEFORE!, unit: "in" };

describe("buildItems — one item per observable change", () => {
  it("splits a multi-param action into a row per parameter", () => {
    const items = buildItems([{ type: "set_fourbar", params: { ground: 5, input: 1 } }], BEFORE);
    expect(items.map((i) => `${i.label} ${i.value}`)).toEqual([
      "Ground r₁ 4.00 mm → 5.00 mm",
      "Input r₂ 1.20 mm → 1.00 mm",
    ]);
  });

  it("drops parameters re-sent at the value they already had", () => {
    // The offline agent echoes the whole linkage before editing it, so a turn's first action
    // is often a complete no-op. Counting those would bury the real edits under "+7 more".
    const actions: WorkspaceAction[] = [
      { type: "set_fourbar", params: { ground: 4, input: 1.2, coupler: 3.5, output: 3, circuit: "open" } },
      { type: "set_fourbar", params: { ground: 5, coupler: 4.5 } },
      { type: "run_analysis" },
    ];
    const items = buildItems(actions, BEFORE);
    expect(items.map((i) => i.label)).toEqual(["Ground r₁", "Coupler r₃", "ran analysis"]);
    expect(items[0].value).toBe("4.00 mm → 5.00 mm");
  });

  it("compares against what the previous action left behind, not the turn's start", () => {
    const actions: WorkspaceAction[] = [
      { type: "set_fourbar", params: { ground: 5 } },
      { type: "set_fourbar", params: { ground: 6 } },
    ];
    expect(buildItems(actions, BEFORE).map((i) => i.value)).toEqual([
      "4.00 mm → 5.00 mm",
      "5.00 mm → 6.00 mm",
    ]);
  });

  it("keeps every row when there is no pre-turn state to compare against", () => {
    // Messages persisted before TurnMeta existed have no `before` — show the values as given
    // rather than silently dropping rows we cannot classify. There is no declared unit to read
    // either, so the rows carry the default rather than going bare: a length with no unit is the
    // `4.0000 units` defect in miniature, and the default is the only defensible guess here.
    const items = buildItems([{ type: "set_fourbar", params: { ground: 4, input: 1.2 } }], undefined);
    expect(items.map((i) => i.value)).toEqual(["4.00 mm", "1.20 mm"]);
  });

  it("never leaks stored radians into an angle row", () => {
    const items = buildItems([{ type: "set_fourbar", params: { couplerPointAngle: toRad(50) } }], BEFORE);
    expect(items[0].label).toBe("Cpl pt ∠");
    expect(items[0].value).toBe("35° → 50°");
  });

  it("ignores an explicitly-undefined param without poisoning later comparisons", () => {
    const actions: WorkspaceAction[] = [
      { type: "set_fourbar", params: { ground: undefined } },
      { type: "set_fourbar", params: { ground: 5 } },
    ];
    expect(buildItems(actions, BEFORE).map((i) => i.value)).toEqual(["4.00 mm → 5.00 mm"]);
  });

  it("labels each length with the unit the turn was written in, not a hardcoded one", () => {
    // The trace is read back out of a saved conversation, so the unit it prints has to be the one
    // that was declared when the turn happened — relabelling an old transcript to today's unit
    // would put inches on figures the user entered as millimetres.
    const items = buildItems([{ type: "set_fourbar", params: { ground: 5, input: 1 } }], IN_BEFORE);
    expect(items.map((i) => i.value)).toEqual(["4.00 in → 5.00 in", "1.20 in → 1.00 in"]);

    // Both halves, and only the lengths: an angle is not measured in any of the declarable units,
    // and the circuit is not measured at all.
    const mixed = buildItems(
      [{ type: "set_fourbar", params: { couplerPointAngle: toRad(50), circuit: "crossed" } }],
      IN_BEFORE,
    );
    expect(mixed.map((i) => i.value)).toEqual(["35° → 50°", "Open → Crossed"]);
  });
});

describe("buildItems — non-parameter actions", () => {
  it("reports the solver running, with its own explanation", () => {
    const [item] = buildItems([{ type: "run_analysis" }], BEFORE);
    expect(item.kind).toBe("run_analysis");
    expect(item.label).toBe("ran analysis");
    expect(item.detail).toMatch(/deterministic solver/);
  });

  it("names the mechanism a switch landed on", () => {
    expect(buildItems([{ type: "set_mechanism", kind: "slidercrank" }], BEFORE)[0].label).toBe("slider-crank");
  });

  it("produces no row for a switch to the mechanism already on screen", () => {
    // These rows are what the approval card offers to Apply, so a row here would promise a no-op.
    expect(buildItems([{ type: "set_mechanism", kind: "fourbar" }], BEFORE)).toEqual([]);
    // …but with no pre-turn state there is nothing to compare against, so keep the row rather
    // than guess — same rule the parameter rows follow.
    expect(buildItems([{ type: "set_mechanism", kind: "fourbar" }], undefined)[0].label).toBe("four-bar");
  });

  it("names a generated CAD part and counts the dimensions it leaves editable", () => {
    const node: CadModel["node"] = { type: "box", size: ["width", 10, 10] };
    const model: CadModel = {
      name: "Bracket",
      node,
      params: [
        { key: "width", label: "Width", value: 40, min: 20, max: 80, unit: "mm" },
        { key: "hole_r", label: "Hole radius", value: 3, min: 1.5, max: 8, unit: "mm" },
      ],
    };
    const [item] = buildItems([{ type: "set_cad", model }], BEFORE);
    expect(item.label).toBe("Bracket");
    expect(item.detail).toBe("2 editable parameters");
  });

  it("leaves a param-less CAD row free for the action's note", () => {
    const model: CadModel = { name: "Spacer", node: { type: "box", size: [10, 10, 10] } };
    expect(buildItems([{ type: "set_cad", model }], BEFORE)[0].detail).toBeUndefined();
    const noted = buildItems([{ type: "set_cad", model, note: "press-fit on the crank pin" }], BEFORE);
    expect(noted[0].detail).toBe("press-fit on the crank pin");
  });

  it("produces no row for a generated image — Thread renders it inline", () => {
    const items = buildItems([{ type: "generated_image", dataUrl: "data:,", prompt: "a crank" }], BEFORE);
    expect(items).toEqual([]);
  });

  it("hangs an action's note on the first row it produced", () => {
    const actions: WorkspaceAction[] = [
      { type: "set_fourbar", params: { ground: 5, input: 1 }, note: "widened the base for a better time ratio" },
    ];
    const items = buildItems(actions, BEFORE);
    expect(items[0].detail).toBe("widened the base for a better time ratio");
    expect(items[1].detail).toBeUndefined();
  });

  it("returns nothing for a turn that changed nothing, so the trace can hide itself", () => {
    expect(buildItems([], BEFORE)).toEqual([]);
    expect(buildItems([{ type: "set_fourbar", params: { ground: 4 } }], BEFORE)).toEqual([]);
  });
});
