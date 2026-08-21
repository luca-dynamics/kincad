// A small curated mechanical-engineering knowledge base for the OFFLINE agent, so the chat
// is genuinely useful with no API key. A connected Claude model answers far more broadly;
// this covers the common kinematics topics a student asks during a four-bar/slider-crank study.
//
// EVERY ANSWER IS MARKDOWN. components/chat/Markdown.tsx renders these through remark-gfm and
// remark-math, so the separators carry meaning: blocks are split with "\n\n", list items start
// with "- ", and a standalone equation goes in $$…$$ rather than being left inline. These answers
// used to join their lines with a single "\n" — a soft break, which markdown collapses to a space —
// so the Gruebler equation was swallowed into its own sentence and the Grashof conditions ran
// together as one paragraph.
//
// Inside math, write LaTeX (`j_1`, `\\theta_4`, `\\ge`); outside it, keep the Unicode forms the rest
// of the app uses (j₁, θ₄, ≥). KaTeX will not set Unicode subscripts. Note that every backslash in
// a JS string literal must be doubled — "\cos" silently becomes "cos".
//
// DISPLAY MATH NEEDS THE `$$` ON THEIR OWN LINES. remark-math's flow parser forbids a `$` in the
// fence's info string, so a single-line `$$E = mc^2$$` fails to open a display block and is picked
// up by the *inline* parser instead — it renders as a `<span class="katex">` inside the paragraph,
// not a `.katex-display`, so it is neither centred nor covered by the overflow rule in index.css.
// Verified in the browser: `$$x$$` gives `p > span.katex`; `$$\nx\n$$` gives `.katex-display`.

interface Topic {
  match: RegExp;
  answer: string;
}

export const TOPICS: Topic[] = [
  {
    match: /grashof/i,
    answer:
      "**Grashof's condition** tells you whether a four-bar linkage has a fully rotating link. " +
      "With the shortest link S, longest L, and the other two P and Q:\n\n" +
      "- $S + L < P + Q$ — **Grashof**: at least one link makes full revolutions.\n" +
      "- $S + L = P + Q$ — **change-point**: passes through collinear singularities, e.g. a parallelogram.\n" +
      "- $S + L > P + Q$ — **non-Grashof**: every link only rocks.\n\n" +
      "Which link rotates depends on which is shortest:\n\n" +
      "- shortest = ground → double-crank\n" +
      "- shortest = a side link → crank-rocker\n" +
      "- shortest = coupler → double-rocker",
  },
  {
    match: /transmission angle/i,
    answer:
      "The **transmission angle μ** is the angle between the coupler and the output link. " +
      "It measures how effectively force is transmitted: μ = 90° is ideal, and good practice keeps " +
      "40° ≤ μ ≤ 140°.\n\n" +
      "As μ → 0° or 180° the mechanism approaches a toggle/dead position where it can bind and the " +
      "mechanical advantage spikes.",
  },
  {
    match: /degrees? of freedom|dof|gr(ue|ü)bler|kutzbach/i,
    answer:
      "For a planar mechanism, **Gruebler/Kutzbach** gives the mobility:\n\n" +
      "$$\nM = 3(n - 1) - 2j_1 - j_2\n$$\n\n" +
      "where:\n\n" +
      "- $n$ — number of links, including ground\n" +
      "- $j_1$ — lower pairs (pin/slider), 1 DOF each\n" +
      "- $j_2$ — higher pairs (cam/gear contact), 2 DOF each\n\n" +
      "A four-bar has n = 4, j₁ = 4, j₂ = 0 → M = 1. One input fully determines the motion.",
  },
  {
    match: /coupler curve|coupler point/i,
    answer:
      "A **coupler curve** is the path traced by a point on the coupler (floating) link as the " +
      "mechanism moves.\n\n" +
      "Four-bar coupler curves can be remarkably varied — symmetric, figure-eight, with cusps or " +
      "straight-line segments — which is why four-bars are used for path generation. Move the " +
      "coupler point (distance + angle from joint A) to reshape it.",
  },
  {
    match: /dead ?cent(er|re)|toggle/i,
    answer:
      "**Dead-centre (toggle) positions** occur when the input link and coupler become collinear, " +
      "so the input momentarily cannot drive the output (transmission angle → 0°/180°).\n\n" +
      "Mechanical advantage is theoretically infinite there. They define the rocker's extreme " +
      "positions in a crank-rocker.",
  },
  {
    match: /mechanical advantage/i,
    answer:
      "**Mechanical advantage** of a linkage is the ratio of output force/torque to input, and for " +
      "an ideal (lossless) four-bar it equals\n\n" +
      "$$\n\\left| \\omega_\\mathrm{in} \\, / \\, \\omega_\\mathrm{out} \\right|\n$$\n\n" +
      "It becomes very large near toggle positions (output velocity → 0) and is closely tied to the " +
      "transmission angle.",
  },
  {
    match: /slider.?crank|reciprocat/i,
    answer:
      "A **slider-crank** converts rotation to reciprocating translation (or vice-versa) — the " +
      "basis of piston engines and pumps.\n\n" +
      "Key parameters:\n\n" +
      "- **crank** r₂\n" +
      "- **connecting rod** r₃\n" +
      "- **offset** e — 0 for in-line\n\n" +
      "The crank rotates fully only if $r_3 \\ge e + r_2$. An offset makes the forward and return " +
      "strokes take unequal crank angles (quick-return behaviour).",
  },
  {
    match: /freudenstein|function generat|synthesi/i,
    answer:
      "**Synthesis** designs a linkage to achieve desired motion. For four-bar *function " +
      "generation*, **Freudenstein's equation**\n\n" +
      "$$\nK_1 \\cos\\theta_4 - K_2 \\cos\\theta_2 + K_3 = \\cos(\\theta_2 - \\theta_4)\n$$\n\n" +
      "lets you pick three precision points (input→output angle pairs) and solve a 3×3 linear " +
      "system for the link ratios. The result must be verified by analysis — which this tool does " +
      "automatically.",
  },
  {
    match: /quick.?return/i,
    answer:
      "A **quick-return mechanism** has a working stroke slower than its return stroke, useful in " +
      "shapers/saws.\n\n" +
      "It arises from the time-ratio between the crank angles for the two strokes — created by an " +
      "offset slider-crank or an offset in a four-bar. The larger the asymmetry, the stronger the " +
      "quick-return effect.",
  },
];

export function lookupKnowledge(q: string): string | null {
  for (const t of TOPICS) if (t.match.test(q)) return t.answer;
  return null;
}
