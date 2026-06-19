// Lightweight natural-language → workspace-action parser for the OFFLINE agent.
// (A connected Claude model does this via real tool-use; this keeps the app fully usable
// without a key.) It recognises mechanism switches, parameter edits, and named presets.

import type { WorkspaceAction } from "./types";
import type { MechanismKind } from "../state";

export interface ParsedIntent {
  actions: WorkspaceAction[];
  /** Human-readable note describing what was understood, or null if nothing matched. */
  note: string | null;
}

const FOURBAR_KEYS: Record<string, keyof import("../engine").FourBarLinkage> = {
  ground: "ground",
  frame: "ground",
  r1: "ground",
  input: "input",
  crank: "input",
  r2: "input",
  coupler: "coupler",
  r3: "coupler",
  output: "output",
  rocker: "output",
  r4: "output",
};

const SLIDER_KEYS: Record<string, keyof import("../engine").SliderCrankLinkage> = {
  crank: "crank",
  r2: "crank",
  rod: "rod",
  "connecting rod": "rod",
  r3: "rod",
  offset: "offset",
  eccentric: "offset",
};

export function parseIntent(text: string, kind: MechanismKind): ParsedIntent {
  const t = text.toLowerCase();
  const actions: WorkspaceAction[] = [];
  const notes: string[] = [];

  // --- mechanism switch ---
  let targetKind = kind;
  if (/\bslider.?crank\b/.test(t) && kind !== "slidercrank") {
    targetKind = "slidercrank";
    actions.push({ type: "set_mechanism", kind: "slidercrank" });
    notes.push("switched to slider-crank");
  } else if (/\bfour.?bar\b/.test(t) && kind !== "fourbar") {
    targetKind = "fourbar";
    actions.push({ type: "set_mechanism", kind: "fourbar" });
    notes.push("switched to four-bar");
  }

  // --- named presets (four-bar) ---
  if (/\bcrank.?rocker\b/.test(t)) {
    actions.push({
      type: "set_fourbar",
      params: { ground: 4, input: 1.2, coupler: 3.5, output: 3, circuit: "open" },
    });
    notes.push("set a crank-rocker preset");
  } else if (/\b(drag.?link|double.?crank)\b/.test(t)) {
    actions.push({
      type: "set_fourbar",
      params: { ground: 1.2, input: 3, coupler: 3, output: 3.2, circuit: "open" },
    });
    notes.push("set a drag-link (double-crank) preset");
  } else if (/\bdouble.?rocker\b/.test(t)) {
    actions.push({
      type: "set_fourbar",
      params: { ground: 4, input: 2.5, coupler: 1.2, output: 3.5, circuit: "open" },
    });
    notes.push("set a double-rocker preset");
  }

  // --- explicit "name value" parameter edits, e.g. "ground to 4", "crank 1.2", "rod = 5" ---
  const keys = targetKind === "fourbar" ? FOURBAR_KEYS : SLIDER_KEYS;
  const fourParams: Record<string, number> = {};
  const sliderParams: Record<string, number> = {};
  const re = /\b([a-z ]+?)\s*(?:=|to|:)?\s*(-?\d+(?:\.\d+)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const rawKey = m[1].trim().split(/\s+/).slice(-2).join(" ").trim();
    const val = parseFloat(m[2]);
    // try the 2-word key then the last word
    const k1 = rawKey;
    const k2 = rawKey.split(" ").slice(-1)[0];
    const mapped = (keys as Record<string, string>)[k1] ?? (keys as Record<string, string>)[k2];
    if (mapped && isFinite(val)) {
      if (targetKind === "fourbar") fourParams[mapped] = val;
      else sliderParams[mapped] = val;
    }
  }
  if (Object.keys(fourParams).length) {
    actions.push({ type: "set_fourbar", params: fourParams });
    notes.push(
      "set " + Object.entries(fourParams).map(([k, v]) => `${k}=${v}`).join(", "),
    );
  }
  if (Object.keys(sliderParams).length) {
    actions.push({ type: "set_slidercrank", params: sliderParams });
    notes.push(
      "set " + Object.entries(sliderParams).map(([k, v]) => `${k}=${v}`).join(", "),
    );
  }

  return { actions, note: notes.length ? notes.join("; ") : null };
}
