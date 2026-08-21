import { describe, it, expect } from "vitest";
import { speechText } from "../useSpeech";
import { describeReport } from "../../ai/narrate";
import { buildFourBarReport } from "../../engine";
import { DEFAULT_FOURBAR } from "../../state";

// The agent's replies are markdown; the speech synthesiser is not a markdown reader. Every rule in
// `speechText` exists because some real reply read badly out loud, so the cases below are the
// actual shapes narrate.ts, knowledge.ts and mock.ts emit — not invented ones.

describe("speechText — markdown that has to be heard, not seen", () => {
  it("drops the list marker instead of pronouncing it", () => {
    // The bug this was written for: "- **Input** — full 360° crank" was read as "dash Input…".
    const out = speechText("- **Input** — full 360° crank");
    expect(out.startsWith("-")).toBe(false);
    expect(out).toBe("Input, full 360° crank");
  });

  it("handles every bullet character the app has ever emitted", () => {
    // `•` is not markdown, but conversations saved before narrate.ts was rewritten still hold it.
    for (const marker of ["- ", "* ", "+ ", "• ", "1. ", "2) "]) {
      expect(speechText(`${marker}Transmission angle`)).toBe("Transmission angle");
    }
  });

  it("gives each bullet its own sentence so the figures don't run together", () => {
    // Only the interior breaks earn a full stop — the last item ends the utterance anyway.
    const out = speechText("- **Input** — full 360° crank\n- **Output ω₄** — 0.50 rad/s");
    expect(out).toBe("Input, full 360° crank. Output ω₄, 0.50 rad/s");
  });

  it("does not add a second full stop to a line that already ends in one", () => {
    // A trailing space before the newline used to be captured, giving "crank-rocker. . Grashof".
    expect(speechText("Four-bar linkage. \n\nGrashof crank-rocker.")).toBe(
      "Four-bar linkage. Grashof crank-rocker.",
    );
    // A colon is a pause of its own, so it keeps it rather than gaining a stop.
    expect(speechText("Offline mode handles three things:\n\n- Workspace commands")).toBe(
      "Offline mode handles three things: Workspace commands",
    );
  });

  it("strips the warning glyph but keeps the engine's wording", () => {
    const out = speechText("**Design-rule warnings**\n\n- ⚠ Transmission angle drops below 30°.");
    expect(out).toBe("Design-rule warnings. Transmission angle drops below 30°.");
  });

  it("reads an equation, not its delimiters", () => {
    expect(speechText("$$M = 3(n - 1) - 2j_1 - j_2$$")).toBe("M = 3(n - 1) - 2j1 - j2");
    // `\mu` has no spoken form worth guessing at, and `^`/`\circ` are notation, not words.
    expect(speechText("the angle $\\mu$ stays above $30^\\circ$")).toBe("the angle stays above 30");
  });

  it("summarises a code fence rather than spelling out the JSON", () => {
    const out = speechText('Here you go:\n\n```json\n{ "ground": 4 }\n```');
    expect(out).toBe("Here you go: (code block)");
    expect(out).not.toContain("ground");
  });

  it("says the link text, not the URL", () => {
    expect(speechText("see [the plots](https://example.com/a/b)")).toBe("see the plots");
  });

  it("leaves nothing to speak when there was nothing to say", () => {
    expect(speechText("   \n\n  ")).toBe("");
  });
});

describe("speechText — the numbers survive it", () => {
  // The engine is the single source of truth for every figure. A cleanup rule that eats a minus
  // sign or a decimal point would make the spoken report disagree with the panel beside it.
  const report = buildFourBarReport(DEFAULT_FOURBAR, 360);
  // `describeReport` takes the declared unit with no default (see narrate.ts). Millimetres here,
  // the workspace default — and a unit whose own text ("mm") carries no digit the number rules
  // below could mistake for a figure.
  const described = describeReport(report, "mm");

  it("keeps every figure narrate.ts states", () => {
    const spoken = speechText(described);
    for (const figure of described.match(/-?\d+\.\d+/g) ?? []) {
      expect(spoken).toContain(figure);
    }
  });

  it("keeps a negative figure negative", () => {
    // The leading `-` of "-0.69" is not a list marker: the marker rule is line-anchored.
    expect(speechText("- **Output ω₄** — -0.69 → 0.50 rad/s")).toContain("-0.69");
  });

  it("emits no markdown syntax at all", () => {
    expect(speechText(described)).not.toMatch(/[*_`#>|~^{}⚠]|\n/);
  });
});
