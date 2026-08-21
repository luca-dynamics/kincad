// Lightweight natural-language → workspace-action parser for the OFFLINE agent.
// (A connected Claude model does this via real tool-use; this keeps the app fully usable
// without a key.) It recognises mechanism switches, parameter edits, and named presets.

import type { WorkspaceAction } from "./types";
import type { MechanismKind } from "../state";
import { toRad } from "../engine";

export interface ParsedIntent {
  actions: WorkspaceAction[];
  /** Human-readable note describing what was understood, or null if nothing matched. */
  note: string | null;
}

/**
 * The one field here that is NOT stored in the unit it is typed in: the action carries δ₃ in
 * radians, the dock and the report state it in degrees, so a bare number from the chat is read as
 * degrees and converted. Named rather than inlined because two places depend on it — the value
 * written into the action, and the note, which has to quote back the degrees the user actually said.
 */
const ANGLE_KEY = "couplerPointAngle";

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
  // The coupler point. Both spellings are here because the two places a user reads these names
  // disagree: the dock labels the sliders "Cpl pt dist" and "Cpl pt ∠", the report prints them as
  // p and δ₃. Multi-word names are reachable now — see the three-word lookup below.
  "coupler point dist": "couplerPointDist",
  "coupler point": "couplerPointDist",
  "cpl pt dist": "couplerPointDist",
  "point dist": "couplerPointDist",
  "pt dist": "couplerPointDist",
  dist: "couplerPointDist",
  p: "couplerPointDist",
  "coupler point angle": ANGLE_KEY,
  "cpl pt angle": ANGLE_KEY,
  "point angle": ANGLE_KEY,
  "pt angle": ANGLE_KEY,
  delta3: ANGLE_KEY,
  // A bare "angle" is deliberately absent. "set the angle to 90" almost certainly means the crank
  // angle θ₂ — which no action can set, so there is nothing to route it to — and answering it by
  // moving the coupler point would edit a quantity the user never mentioned.
};

const SLIDER_KEYS: Record<string, keyof import("../engine").SliderCrankLinkage> = {
  crank: "crank",
  r2: "crank",
  rod: "rod",
  "connecting rod": "rod",
  r3: "rod",
  offset: "offset",
  eccentric: "offset",
  e: "offset", // as the report prints it
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

  // --- explicit "name value" parameter edits, e.g. "ground to 4", "crank 1.2", "rod = 5", "r1 to 5" ---
  const keys = targetKind === "fourbar" ? FOURBAR_KEYS : SLIDER_KEYS;
  const fourParams: Record<string, number> = {};
  const sliderParams: Record<string, number> = {};
  // The key may END IN A DIGIT, because six of the aliases above are the symbols an engineer actually
  // writes: r1…r4. The class used to be `[a-z ]+?`, which cannot hold a digit, so "change the r1 to 5"
  // tokenised as key "change the r" / value 1 — the value was the subscript, the real number fell out
  // as a keyless " " / 5, nothing mapped, and the turn reached the user as the offline-mode blurb.
  // Every rN alias was dead on arrival while sitting in the map as though it worked.
  //
  // `(?!to\b)` is what keeps the separator out of the key. The key has to be greedy to reach a
  // trailing digit, and a greedy key swallows "to" — which would leave "set the ground to 5" ending
  // in the wrong word and losing the name it had already matched before this fix.
  const re = /\b((?!to\b)[a-z]+\d?(?:\s+(?!to\b)[a-z]+\d?)*)\s*(?:=|to|:)?\s*(-?\d+(?:\.\d+)?)\b/g;

  /**
   * What the user typed, per field, for the note. Kept beside the params rather than derived from
   * them because δ₃ is stored in radians: quoting the params back would print
   * `couplerPointAngle=0.8726646259971648` to someone who typed 50.
   */
  const typed: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const words = m[1].trim().split(/\s+/);
    const val = parseFloat(m[2]);
    // Longest name first, up to three words: "coupler point angle" has to win over "point angle",
    // and both over the trailing word alone. The window used to be two words, which put every
    // three-word name out of reach — including the coupler point's own label on the dock.
    const table = keys as Record<string, string>;
    const mapped =
      table[words.slice(-3).join(" ")] ??
      table[words.slice(-2).join(" ")] ??
      table[words[words.length - 1]];
    if (mapped && isFinite(val)) {
      const isAngle = mapped === ANGLE_KEY;
      typed[mapped] = isAngle ? `${val}°` : String(val);
      if (targetKind === "fourbar") fourParams[mapped] = isAngle ? toRad(val) : val;
      else sliderParams[mapped] = val;
    }
  }
  // Named off the params rather than off `typed`, so a field set twice in one sentence is reported
  // once, at the value that survived.
  const describe = (p: Record<string, number>) =>
    "set " + Object.keys(p).map((k) => `${k}=${typed[k]}`).join(", ");
  if (Object.keys(fourParams).length) {
    actions.push({ type: "set_fourbar", params: fourParams });
    notes.push(describe(fourParams));
  }
  if (Object.keys(sliderParams).length) {
    actions.push({ type: "set_slidercrank", params: sliderParams });
    notes.push(describe(sliderParams));
  }

  return { actions, note: notes.length ? notes.join("; ") : null };
}
