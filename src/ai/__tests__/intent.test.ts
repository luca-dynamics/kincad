import { describe, it, expect } from "vitest";
import { parseIntent } from "../intent";
import { toDeg, toRad } from "../../engine";

/**
 * The offline parser had no tests, and that is exactly how it shipped with six advertised aliases
 * that could never fire: `r1`–`r4` in the four-bar map and `r2`/`r3` in the slider map were listed
 * beside the words, but the key/value tokeniser's character class held no digits, so "change the r1
 * to 5" read the subscript as the value and the request reached the user as the offline-mode blurb.
 * The map said the alias worked; nothing checked. These cases are that check.
 */

const params = (text: string, kind: "fourbar" | "slidercrank" = "fourbar") => {
  const [action] = parseIntent(text, kind).actions;
  return action && "params" in action ? action.params : undefined;
};

describe("parseIntent — symbolic link names", () => {
  it("reads r1…r4 as the links they label", () => {
    // The dock labels these sliders r₁…r₄, so this is the notation the user is reading off the
    // screen while typing — the word forms below are the alternative, not the primary.
    expect(params("r1 = 5")).toEqual({ ground: 5 });
    expect(params("r2 to 1.5")).toEqual({ input: 1.5 });
    expect(params("r3: 4")).toEqual({ coupler: 4 });
    expect(params("set r4 2.5")).toEqual({ output: 2.5 });
  });

  it("reads the same symbols against the slider-crank's own links", () => {
    // r2 is the input link in both mechanisms but a different FIELD — `input` on a four-bar,
    // `crank` on a slider-crank. A parser that mapped by symbol alone would write the wrong one.
    expect(params("r2 = 1.4", "slidercrank")).toEqual({ crank: 1.4 });
    expect(params("r3 = 4.5", "slidercrank")).toEqual({ rod: 4.5 });
    expect(params("offset to 0.6", "slidercrank")).toEqual({ offset: 0.6 });
  });

  it("survives the filler and the typos of a real sentence", () => {
    // "chamge" is what was actually typed when this defect was reported. The verb is discarded
    // either way — the parser never needed to understand it, which is why the typo was never the
    // cause and fixing the spelling would not have fixed the turn.
    expect(params("chamge the r1 to 5")).toEqual({ ground: 5 });
    expect(params("change the r1 to 5")).toEqual({ ground: 5 });
    expect(params("please set r3 to 3.8 for me")).toEqual({ coupler: 3.8 });
  });

  it("still reads the word names, with the separator intact", () => {
    // The regression guard for the fix itself: reaching a trailing digit needs a greedy key, and a
    // greedy key eats the "to" unless it is excluded — which would break every one of these,
    // all of which worked BEFORE the rN aliases did.
    expect(params("set the ground to 5")).toEqual({ ground: 5 });
    expect(params("ground 5")).toEqual({ ground: 5 });
    expect(params("change coupler to 3.5")).toEqual({ coupler: 3.5 });
    expect(params("rocker = 2.8")).toEqual({ output: 2.8 });
    expect(params("connecting rod to 4.2", "slidercrank")).toEqual({ rod: 4.2 });
  });

  it("takes every parameter named in one sentence", () => {
    expect(params("r1 4 and coupler to 3.5 and r4 = 3")).toEqual({
      ground: 4,
      coupler: 3.5,
      output: 3,
    });
  });
});

describe("parseIntent — the coupler point", () => {
  it("reads the distance under the dock's name, the report's name, and the bare symbol", () => {
    // Three vocabularies for one slider: "Cpl pt dist" is what the dock shows, "coupler point
    // dist" is how it reads aloud, and `p` is what the report prints. A user is looking at one of
    // the three when they type.
    expect(params("cpl pt dist to 2.5")).toEqual({ couplerPointDist: 2.5 });
    expect(params("set the coupler point dist to 2.5")).toEqual({ couplerPointDist: 2.5 });
    expect(params("coupler point 2.5")).toEqual({ couplerPointDist: 2.5 });
    expect(params("p = 2.5")).toEqual({ couplerPointDist: 2.5 });
  });

  it("reads the angle as DEGREES and stores the radians the action carries", () => {
    // The one conversion in this file. The dock and the report both state δ₃ in degrees, so a bare
    // number from the chat is degrees; `set_fourbar` carries radians. Getting this backwards would
    // set δ₃ to 50 radians — 2865°, silently wrapped, and no error anywhere to say so.
    expect(params("cpl pt angle to 50")).toEqual({ couplerPointAngle: toRad(50) });
    expect(params("set coupler point angle 50")).toEqual({ couplerPointAngle: toRad(50) });
    expect(params("delta3 = 50")).toEqual({ couplerPointAngle: toRad(50) });

    const stored = (params("pt angle -20") as { couplerPointAngle: number }).couplerPointAngle;
    expect(toDeg(stored)).toBeCloseTo(-20, 10);
    expect(Math.abs(stored)).toBeLessThan(Math.PI); // radians, not degrees smuggled through
  });

  it("quotes the angle back in the degrees the user typed, not in radians", () => {
    // The note becomes "Done — set …" in the reply. `couplerPointAngle=0.8726646259971648` is
    // technically what was stored and useless to read, which is why the note keeps the typed value.
    expect(parseIntent("cpl pt angle to 50", "fourbar").note).toBe("set couplerPointAngle=50°");
    expect(parseIntent("r1 to 5", "fourbar").note).toBe("set ground=5");
  });

  it("does not read a bare 'angle' as the coupler point", () => {
    // "set the angle to 90" reads as the crank angle θ₂ to anyone who says it — and θ₂ is not a
    // linkage dimension, so there is nothing here to route it to. Guessing δ₃ would edit a
    // quantity the user never named and report it as though they had.
    expect(parseIntent("set the angle to 90", "fourbar").actions).toEqual([]);
  });

  it("distinguishes the coupler from the coupler point", () => {
    // "coupler" and "coupler point" differ by one word and are different links. The longest-name
    // -first lookup is what keeps them apart.
    expect(params("coupler 3.5")).toEqual({ coupler: 3.5 });
    expect(params("coupler point 3.5")).toEqual({ couplerPointDist: 3.5 });
    expect(params("set coupler to 3.5 and cpl pt dist to 2")).toEqual({
      coupler: 3.5,
      couplerPointDist: 2,
    });
  });

  it("reads the slider offset under the symbol the report prints", () => {
    expect(params("e = 0.6", "slidercrank")).toEqual({ offset: 0.6 });
    expect(params("eccentric to 0.6", "slidercrank")).toEqual({ offset: 0.6 });
  });
});

describe("parseIntent — mechanism and presets", () => {
  it("names a switch and reads the following numbers against the NEW mechanism", () => {
    // "switch to slider-crank and set r3 to 4" must write `rod`, not the four-bar's `coupler`:
    // the switch is in the same turn, so the keys have to be resolved against where the turn ends.
    const { actions, note } = parseIntent("switch to slider-crank and set r3 to 4", "fourbar");
    expect(actions[0]).toEqual({ type: "set_mechanism", kind: "slidercrank" });
    expect(actions[1]).toEqual({ type: "set_slidercrank", params: { rod: 4 } });
    expect(note).toMatch(/switched to slider-crank/);
  });

  it("produces no switch when the mechanism named is the one already loaded", () => {
    expect(parseIntent("analyse this four-bar", "fourbar").actions).toEqual([]);
  });

  it("sets the named presets", () => {
    expect(params("make a crank-rocker")).toEqual({
      ground: 4, input: 1.2, coupler: 3.5, output: 3, circuit: "open",
    });
    expect(params("drag link please")).toMatchObject({ ground: 1.2 });
    expect(params("double rocker")).toMatchObject({ coupler: 1.2 });
  });

  it("lets an explicit number override the preset it follows", () => {
    // Both actions are emitted, preset first, so `applyActions` lands on the explicit value —
    // "a crank-rocker with r1 = 6" is one request, not a contradiction.
    const { actions } = parseIntent("a crank-rocker with r1 = 6", "fourbar");
    expect(actions).toEqual([
      { type: "set_fourbar", params: { ground: 4, input: 1.2, coupler: 3.5, output: 3, circuit: "open" } },
      { type: "set_fourbar", params: { ground: 6 } },
    ]);
  });
});

describe("parseIntent — what it declines", () => {
  it("returns nothing for text that names no parameter, so the caller can answer instead", () => {
    // A null note is the signal OfflineAgent uses to fall through to narration and the knowledge
    // base. Inventing an action here would edit the mechanism in reply to a question about it.
    expect(parseIntent("what is a transmission angle?", "fourbar")).toEqual({ actions: [], note: null });
    expect(parseIntent("explain the results", "fourbar")).toEqual({ actions: [], note: null });
  });

  it("ignores a number attached to no name it knows", () => {
    expect(parseIntent("increase it by 2", "fourbar").actions).toEqual([]);
  });
});
