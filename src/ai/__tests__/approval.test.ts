import { describe, it, expect } from "vitest";
import { isMutating, markAt, supersedePending, tookEffect } from "../approval";
import type { ApprovalState, ChatMessage, WorkspaceAction } from "../types";

/** A minimal assistant turn carrying one change and a decision. */
const turn = (approval?: ApprovalState, actions: WorkspaceAction[] = [{ type: "run_analysis" }]): ChatMessage => ({
  role: "assistant",
  content: "…",
  actions,
  approval,
});

describe("isMutating — where consent is required", () => {
  it("gates every action that changes the workspace", () => {
    const mutating: WorkspaceAction[] = [
      { type: "set_mechanism", kind: "fourbar" },
      { type: "set_fourbar", params: { ground: 5 } },
      { type: "set_slidercrank", params: { crank: 1.5 } },
      { type: "set_cad", model: { name: "Bracket", node: { type: "box", size: [10, 10, 10] } } },
    ];
    expect(mutating.map(isMutating)).toEqual([true, true, true, true]);
  });

  it("lets analysis and images through — neither is a change to consent to", () => {
    // `analyze` is derived from state, and the image already exists inside the message. Gating
    // either would put an Apply button on something Apply cannot affect.
    const free: WorkspaceAction[] = [
      { type: "run_analysis" },
      { type: "generated_image", dataUrl: "data:,", prompt: "a crank" },
    ];
    expect(free.map(isMutating)).toEqual([false, false]);
  });
});

describe("tookEffect — did the workspace actually move", () => {
  it("is true only for turns that landed", () => {
    expect(tookEffect(turn("applied"))).toBe(true);
    expect(tookEffect(turn("auto"))).toBe(true);
  });

  it("is false while a proposal is undecided or after it lapsed", () => {
    expect(tookEffect(turn("pending"))).toBe(false);
    expect(tookEffect(turn("discarded"))).toBe(false);
    expect(tookEffect(turn("superseded"))).toBe(false);
  });

  it("treats an ungated turn as landed when it carried actions", () => {
    // Either it proposed nothing (analysis only) or it predates the approval flow, in which
    // case it was applied the moment it arrived. Both did reach the workspace.
    expect(tookEffect(turn(undefined))).toBe(true);
    expect(tookEffect({})).toBe(false); // a conceptual answer, no actions at all
    expect(tookEffect({ actions: [] })).toBe(false);
  });
});

describe("markAt — resolving one proposal", () => {
  it("marks the pending turn and leaves the rest untouched", () => {
    const before: ChatMessage[] = [turn("applied"), turn("pending")];
    const after = markAt(before, 1, "discarded");
    expect(after.map((m) => m.approval)).toEqual(["applied", "discarded"]);
    expect(after[0]).toBe(before[0]); // untouched messages keep their identity
  });

  it("refuses to re-decide a turn that is no longer pending", () => {
    // A double-click, or a stale index after the thread grew, must not overwrite a decision.
    const decided: ChatMessage[] = [turn("applied")];
    expect(markAt(decided, 0, "discarded")).toBe(decided);
  });

  it("ignores an index that is out of range", () => {
    const ms: ChatMessage[] = [turn("pending")];
    expect(markAt(ms, 7, "applied")).toBe(ms);
    expect(markAt([], 0, "applied")).toEqual([]);
  });
});

describe("supersedePending — at most one live proposal", () => {
  it("lapses the outstanding proposal and only that one", () => {
    const before: ChatMessage[] = [turn("applied"), turn("discarded"), turn("pending")];
    expect(supersedePending(before).map((m) => m.approval)).toEqual(["applied", "discarded", "superseded"]);
  });

  it("returns the same array when nothing is pending, so React can skip the render", () => {
    const ms: ChatMessage[] = [turn("applied"), turn(undefined)];
    expect(supersedePending(ms)).toBe(ms);
  });
});
