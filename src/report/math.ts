// Real mathematical typesetting on jsPDF's built-in fonts — no embedded font asset.
//
// WHY THIS EXISTS. Everything drawn on a page used to pass through `pdfSafe` in [doc.ts](doc.ts),
// which transliterates: `θ₂` printed as `theta2`, `ω₄` as `omega4`, `δ₃` as `delta3`, and the
// Freudenstein equation came out as flat monospace ASCII —
// `K1 cos(theta4) - K2 cos(theta2) + K3 = cos(theta2 - theta4)`. That was legible but it is not how
// an engineering document is written, and the sheet is a final-year project report.
//
// The comment `pdfSafe` was written under said the only alternative was embedding a Unicode TTF, a
// ~700 KB asset for a dozen glyphs. That was wrong. jsPDF registers all fourteen standard PDF fonts,
// and two of them are the way out:
//
//  * SYMBOL (F14). jsPDF writes its font dictionary WITHOUT `/Encoding /WinAnsiEncoding` — unlike
//    every other font it registers — so a viewer applies Symbol's own built-in encoding, where the
//    ASCII byte `q` is θ, `w` is ω, `d` is δ, `m` is μ, `p` is π and `D` is Δ. Every byte stays
//    single-byte, so jsPDF's UTF-16BE fallback (the bug behind the vanishing symbols) is never
//    triggered: we are asking for characters WinAnsi can encode and letting the font map them.
//  * TIMES-ITALIC (F11), which is what a variable is set in.
//
// Per-run font and size switching within one line is what turns those two facts into typesetting:
// a subscript is a smaller digit on a shifted baseline, a fraction is two stacks and a rule, a
// radical is a drawn tick with an overbar. All of it is measured and advanced by hand, which is the
// price of not having a layout engine.
//
// MEASUREMENT, AND THE ONE THING TO KNOW ABOUT IT. jsPDF has no width table for Symbol: it returns
// a flat 580/1000 for every glyph in that font (verified — `doc.getTextWidth` at 1000pt gives 580
// for θ, ω, δ, minus, alike, while it correctly gives 400 for `°`). Advancing by that would leave a
// visible gap after every Greek letter, so Symbol runs are measured against `SYMBOL_W` below —
// Adobe's own AFM widths — and only the Latin fonts go through `getTextWidth`. Nothing else in the
// file needs to know which font it is drawing.
//
// WHAT IS DELIBERATELY NOT USED. Symbol also has glyphs at 0xA3, 0xB3, 0xBB, 0xA5, 0xD6 and 0xAE for
// ≤ ≥ ≈ ∞ √ →, but this environment cannot rasterise a PDF to check which glyph actually lands, and
// a mis-recalled code point prints a confidently wrong symbol — worse than a spelled-out one. So the
// Symbol font is used ONLY for the Greek letters and the minus sign, whose ASCII-range mapping is
// certain, and `√` is *drawn* rather than typed. Everything still unmapped falls through to
// `pdfSafe`, which is why that function stays.

import type { jsPDF } from "jspdf";
import type { RGB } from "./doc";

/** A jsPDF font selection: family and style, as `setFont` takes them. */
export type Face = readonly [family: string, style: string];

export const SANS: Face = ["helvetica", "normal"];
export const SANS_BOLD: Face = ["helvetica", "bold"];
export const SANS_ITALIC: Face = ["helvetica", "italic"];
export const SERIF: Face = ["times", "normal"];
export const SERIF_ITALIC: Face = ["times", "italic"];
export const SYMBOL: Face = ["symbol", "normal"];

/**
 * How a source string is to be set.
 *
 * `variable` is the face for a SINGLE-letter run — `r`, `p`, `e`, `x` — which is italic in an
 * equation and in a row label. Multi-letter runs are words or units (`cos`, `rad/s`, `Coupler`) and
 * always take `text`: setting `s` of `rad/s` in italic because it is one letter is exactly the kind
 * of wrongness a rule like this produces, so pass `variable: text` wherever runs are prose.
 */
export interface Style {
  size: number;
  text: Face;
  variable: Face;
  /** Upper-case the Latin runs. Greek and shifted digits are left alone — `θ₂` must not become `Θ₂`. */
  caps?: boolean;
}

/** Body text: sans throughout, and a lone letter stays upright — prose is not an equation. */
export const proseStyle = (size: number): Style => ({ size, text: SANS, variable: SANS });

/** Row labels: as prose, but a lone letter is the variable it names. */
export const labelStyle = (size: number): Style => ({ size, text: SANS, variable: SANS_ITALIC });

/** A displayed equation: serif throughout, variables italic, in the tradition it is read in. */
export const mathStyle = (size: number): Style => ({ size, text: SERIF, variable: SERIF_ITALIC });

/** A section heading: bold sans, upper-cased, no italics — a heading is not an equation. */
export const headingStyle = (size: number): Style => ({
  size,
  text: SANS_BOLD,
  variable: SANS_BOLD,
  caps: true,
});

// ── the two mappings that make real symbols possible ──────────────────────────────────

/**
 * Unicode → the ASCII byte that is this glyph in Adobe's Symbol encoding. Only the letters the
 * app actually prints, plus their immediate neighbours, so that a wrong entry is a wrong LETTER
 * rather than a wrong kind of symbol.
 */
const SYMBOL_OF: Record<string, string> = {
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "h", θ: "q",
  λ: "l", μ: "m", ν: "n", ξ: "x", π: "p", ρ: "r", σ: "s", τ: "t",
  φ: "f", χ: "c", ψ: "y", ω: "w",
  Γ: "G", Δ: "D", Θ: "Q", Λ: "L", Ξ: "X", Π: "P", Σ: "S", Φ: "F", Ψ: "Y", Ω: "W",
  // U+2212 MINUS SIGN. Symbol's 0x2D is `minus`, a full-width mathematical minus, where WinAnsi's
  // 0x2D is a hyphen — the difference between `a − b` and `a - b` in a displayed equation.
  "−": "-",
};

/**
 * Adobe Symbol AFM advance widths, per 1000 units, for the glyphs above. jsPDF has no table for
 * this font (it answers 580 for everything), and a viewer uses the real metrics because jsPDF emits
 * the font dictionary with no `/Widths` array — so measuring with anything else guarantees the
 * drawn text and the advance disagree.
 */
const SYMBOL_W: Record<string, number> = {
  a: 631, b: 549, g: 411, d: 494, e: 439, z: 494, h: 603, q: 521,
  l: 549, m: 576, n: 521, x: 493, p: 549, r: 549, s: 603, t: 439,
  f: 521, c: 549, y: 686, w: 686,
  G: 603, D: 612, Q: 741, L: 686, X: 645, P: 768, S: 592, F: 763, Y: 795, W: 768,
  "-": 549,
};

/** jsPDF's own fallback, used for anything not in the table so a stray glyph still advances. */
const SYMBOL_W_FALLBACK = 580;

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
/** ¹ ² ³ are Latin-1 code points, the rest are U+207x — two lookups, one meaning. */
const SUPERSCRIPT_LATIN1: Record<string, number> = { "¹": 1, "²": 2, "³": 3 };
const SUPERSCRIPT_UNICODE = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** `ẋ` and `ẍ`: the variable with one or two dots drawn over it — Newton's notation, properly. */
const DOTTED: Record<string, [string, number]> = {
  ẋ: ["x", 1], ẍ: ["x", 2],
  ẏ: ["y", 1], ÿ: ["y", 2],
};

// ── geometry, all as multiples of the run's own size ──────────────────────────────────

/** Ink above and below a baseline, for height reservation. Generous rather than exact. */
const ASC = 0.74;
const DESC = 0.24;

/** A subscript/superscript digit, and how far its baseline shifts. */
const SMALL = 0.66;
const SUB_DROP = 0.20;
const SUP_RISE = 0.36;

/** Height of the fraction rule above the baseline, and the clearance either side of it. */
const AXIS = 0.30;
const FRAC_GAP = 0.18;
/** Side bearing on a fraction, so `K₃ =` does not touch the numerator's first glyph. */
const FRAC_PAD = 2.5;

/** Width of the radical's tick, and the clearance between its overbar and the radicand. */
const TICK_W = 6.5;
const RADICAL_LIFT = 3;

// ── the compiled form ────────────────────────────────────────────────────────────────

type Piece =
  | { p: "run"; s: string; face: Face; size: number; dy: number; dots: number }
  /** Breakable whitespace. `n` spaces, because the source uses double spaces as a column gap. */
  | { p: "space"; n: number; size: number; face: Face }
  /** Unbreakable fixed space, for the gap between two equations on one line. */
  | { p: "pad"; w: number }
  | { p: "radical"; body: Piece[]; size: number }
  | { p: "frac"; num: Piece[]; den: Piece[]; size: number };

/** A compiled, measurable, drawable line. Opaque — build it with `compile`. */
export type Typeset = Piece[];

/**
 * What a caller writes. A bare string is inline math; `{ over, under }` is a stacked fraction;
 * `{ pad }` is fixed horizontal space.
 */
export type Frag = string | { over: string; under: string } | { pad: number };

export function compile(frags: Frag | Frag[], st: Style): Typeset {
  const out: Piece[] = [];
  for (const f of Array.isArray(frags) ? frags : [frags]) {
    if (typeof f === "string") inline(f, st, out);
    else if ("pad" in f) out.push({ p: "pad", w: f.pad });
    else
      out.push({
        p: "frac",
        num: compile(f.over, st),
        den: compile(f.under, st),
        size: st.size,
      });
  }
  return out;
}

/** True for a character that starts a piece of its own, so a plain run stops before it. */
function breaks(ch: string): boolean {
  return (
    ch === " " ||
    ch === "√" ||
    ch in SYMBOL_OF ||
    ch in DOTTED ||
    ch in SUPERSCRIPT_LATIN1 ||
    SUBSCRIPT.includes(ch) ||
    SUPERSCRIPT_UNICODE.includes(ch) ||
    /[A-Za-z]/.test(ch)
  );
}

function inline(src: string, st: Style, out: Piece[]): void {
  const { size } = st;
  const run = (s: string, face: Face, sz = size, dy = 0, dots = 0) => {
    // Greek is never upper-cased: `"θ₂".toUpperCase()` is `"Θ₂"`, a different symbol, and in
    // kinematics the wrong one.
    const caps = st.caps && face[0] !== "symbol";
    out.push({ p: "run", s: caps ? s.toUpperCase() : s, face, size: sz, dy, dots });
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === " ") {
      let n = 0;
      while (src[i] === " ") {
        n++;
        i++;
      }
      out.push({ p: "space", n, size, face: st.text });
      continue;
    }

    // √ takes the following parenthesised group as its radicand — `√(r₃² − g²)` sets the whole
    // difference under one bar, which is the only reading of it that is correct.
    if (ch === "√") {
      i++;
      let j = i;
      if (src[i] === "(") {
        let depth = 0;
        for (; j < src.length; j++) {
          if (src[j] === "(") depth++;
          else if (src[j] === ")" && --depth === 0) break;
        }
        out.push({ p: "radical", body: compile(src.slice(i + 1, j), st), size });
        i = Math.min(j + 1, src.length);
      } else {
        while (j < src.length && src[j] !== " ") j++;
        out.push({ p: "radical", body: compile(src.slice(i, j), st), size });
        i = j;
      }
      continue;
    }

    const greek = SYMBOL_OF[ch];
    if (greek) {
      run(greek, SYMBOL);
      i++;
      continue;
    }

    const dotted = DOTTED[ch];
    if (dotted) {
      const [base, dots] = dotted;
      run(base, st.variable, size, 0, dots);
      i++;
      continue;
    }

    const sub = SUBSCRIPT.indexOf(ch);
    if (sub >= 0) {
      run(String(sub), st.text, size * SMALL, size * SUB_DROP);
      i++;
      continue;
    }

    const sup = SUPERSCRIPT_LATIN1[ch] ?? SUPERSCRIPT_UNICODE.indexOf(ch);
    if (sup >= 0) {
      run(String(sup), st.text, size * SMALL, -size * SUP_RISE);
      i++;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
      const word = src.slice(i, j);
      // One letter is a variable, more is a word. `atan2` sets as an upright `atan` and an upright
      // `2`, which is correct. A unit like `rad/s` would have its `s` italicised by this rule, which
      // is why the styles that print units pass `variable: text` — see `Style`.
      run(word, word.length === 1 ? st.variable : st.text);
      i = j;
      continue;
    }

    let j = i;
    while (j < src.length && !breaks(src[j])) j++;
    run(src.slice(i, j), st.text);
    i = j;
  }
}

// ── measurement ──────────────────────────────────────────────────────────────────────

export interface Metrics {
  w: number;
  /** Ink extent above the baseline, and below it. A fraction is tall on both sides. */
  above: number;
  below: number;
}

/**
 * Symbol is measured from `SYMBOL_W`; everything else from jsPDF, with the font made active first
 * because `getTextWidth` reads the CURRENT selection. Callers must therefore treat the font state as
 * clobbered by any measurement — `draw` re-selects per run, and every emitter in doc.ts sets its
 * font before it draws.
 */
function runWidth(doc: jsPDF, s: string, face: Face, size: number): number {
  if (face[0] === "symbol") {
    let u = 0;
    for (const ch of s) u += SYMBOL_W[ch] ?? SYMBOL_W_FALLBACK;
    return (u / 1000) * size;
  }
  doc.setFont(face[0], face[1]);
  doc.setFontSize(size);
  return doc.getTextWidth(s);
}

/**
 * A space in the run's OWN face. Hardcoding one face here would be almost invisible — Helvetica's
 * space is 0.278em against Times' 0.25em — but it makes the PDF switch fonts at every word boundary
 * of a Times equation, and a reader copying the line out gets a run of Helvetica spaces inside it.
 */
function spaceWidth(doc: jsPDF, face: Face, size: number): number {
  doc.setFont(face[0], face[1]);
  doc.setFontSize(size);
  return doc.getTextWidth(" ");
}

/** The drawing counterpart, advancing by exactly what `spaceWidth` measured — see `drawOne`. */
function drawSpace(doc: jsPDF, pc: Piece & { p: "space" }, x: number, y: number): number {
  const w = spaceWidth(doc, pc.face, pc.size); // also leaves the font selected, which `text` needs
  doc.text(" ".repeat(pc.n), x, y);
  return w * pc.n;
}

export function measure(doc: jsPDF, pieces: Typeset): Metrics {
  let w = 0;
  let above = 0;
  let below = 0;
  for (const pc of pieces) {
    const m = measureOne(doc, pc);
    w += m.w;
    above = Math.max(above, m.above);
    below = Math.max(below, m.below);
  }
  return { w, above, below };
}

function measureOne(doc: jsPDF, pc: Piece): Metrics {
  switch (pc.p) {
    case "run": {
      const w = runWidth(doc, pc.s, pc.face, pc.size);
      const dotRise = pc.dots ? pc.size * 0.30 : 0;
      return {
        w,
        above: Math.max(0, pc.size * ASC - pc.dy) + dotRise,
        below: Math.max(0, pc.size * DESC + pc.dy),
      };
    }
    case "space":
      return { w: spaceWidth(doc, pc.face, pc.size) * pc.n, above: 0, below: 0 };
    case "pad":
      return { w: pc.w, above: 0, below: 0 };
    case "radical": {
      const m = measure(doc, pc.body);
      return {
        w: TICK_W + m.w + 4,
        above: m.above + RADICAL_LIFT + 1,
        below: m.below,
      };
    }
    case "frac": {
      const n = measure(doc, pc.num);
      const d = measure(doc, pc.den);
      const gap = pc.size * FRAC_GAP;
      const axis = pc.size * AXIS;
      return {
        w: Math.max(n.w, d.w) + 2 * FRAC_PAD,
        above: axis + gap + n.below + n.above,
        below: gap - axis + d.above + d.below,
      };
    }
  }
}

// ── drawing ──────────────────────────────────────────────────────────────────────────

/**
 * Draw `pieces` with the first glyph's left edge at `x` and the main baseline at `y`. Returns the
 * total advance, so a caller can chain. `ink` is used for the rules and dots — jsPDF's draw and
 * fill colours are separate from its text colour, and a black rule under a grey fraction is the
 * kind of thing nobody notices until it is printed.
 */
export function draw(doc: jsPDF, pieces: Typeset, x: number, y: number, ink: RGB): number {
  let cx = x;
  for (const pc of pieces) cx += drawOne(doc, pc, cx, y, ink);
  return cx - x;
}

function drawOne(doc: jsPDF, pc: Piece, x: number, y: number, ink: RGB): number {
  switch (pc.p) {
    case "run": {
      const w = runWidth(doc, pc.s, pc.face, pc.size);
      doc.setFont(pc.face[0], pc.face[1]);
      doc.setFontSize(pc.size);
      doc.text(pc.s, x, y + pc.dy);
      if (pc.dots) {
        // Centred over the glyph's own advance, just clear of its x-height.
        const r = pc.size * 0.055;
        const cy = y - pc.size * 0.60;
        doc.setFillColor(...ink);
        const spread = r * 2.4;
        for (let k = 0; k < pc.dots; k++) {
          const cx = x + w / 2 + (pc.dots === 1 ? 0 : (k === 0 ? -spread : spread));
          doc.circle(cx, cy, r, "F");
        }
      }
      return w;
    }
    case "space":
      // Drawn, not merely skipped. A gap made only by moving the cursor leaves no word break in the
      // PDF's text layer, so extractors that do not infer breaks from geometry copy the line out as
      // "Transmissionangle" — and this sheet is a report a reader is expected to quote from. jsPDF
      // keeps a whitespace-only string verbatim, and the width is the one `spaceWidth` advanced by,
      // so the drawn spaces and the layout cannot disagree.
      return drawSpace(doc, pc, x, y);
    case "pad":
      return pc.w;
    case "radical": {
      const m = measure(doc, pc.body);
      const bar = y - m.above - RADICAL_LIFT;
      doc.setDrawColor(...ink);
      doc.setLineWidth(0.6);
      // The tick: down into the descender, back up to the bar, then the bar over the radicand.
      doc.line(x + 0.5, y - pc.size * 0.34, x + 2.2, y + pc.size * 0.10);
      doc.line(x + 2.2, y + pc.size * 0.10, x + TICK_W - 0.5, bar);
      doc.line(x + TICK_W - 0.5, bar, x + TICK_W + m.w + 3, bar);
      draw(doc, pc.body, x + TICK_W, y, ink);
      return TICK_W + m.w + 4;
    }
    case "frac": {
      const n = measure(doc, pc.num);
      const d = measure(doc, pc.den);
      const inner = Math.max(n.w, d.w);
      const gap = pc.size * FRAC_GAP;
      const axis = y - pc.size * AXIS;
      draw(doc, pc.num, x + FRAC_PAD + (inner - n.w) / 2, axis - gap - n.below, ink);
      draw(doc, pc.den, x + FRAC_PAD + (inner - d.w) / 2, axis + gap + d.above, ink);
      doc.setDrawColor(...ink);
      doc.setLineWidth(0.6);
      doc.line(x + FRAC_PAD, axis, x + FRAC_PAD + inner, axis);
      return inner + 2 * FRAC_PAD;
    }
  }
}

// ── wrapping ─────────────────────────────────────────────────────────────────────────

/**
 * Break `pieces` into lines no wider than `maxW`, at spaces. The counterpart of jsPDF's
 * `splitTextToSize`, which cannot be used here: it takes a string, and by the time a paragraph is
 * compiled its runs each carry their own font and size, so the string it would measure is not the
 * one that prints.
 */
export function wrap(doc: jsPDF, pieces: Typeset, maxW: number): Typeset[] {
  const lines: Typeset[] = [];
  let line: Piece[] = [];
  let lineW = 0;
  /** Pieces since the last space — a word may be several runs (`θ₂`), and must not be split. */
  let word: Piece[] = [];
  let wordW = 0;

  const flushWord = () => {
    line.push(...word);
    lineW += wordW;
    word = [];
    wordW = 0;
  };
  const breakLine = () => {
    lines.push(line);
    line = [];
    lineW = 0;
  };

  for (const pc of pieces) {
    const w = measureOne(doc, pc).w;
    if (pc.p === "space") {
      flushWord();
      // A space is only kept when something precedes it on this line; a line never opens with one.
      if (line.length) {
        line.push(pc);
        lineW += w;
      }
      continue;
    }
    if (lineW + wordW + w > maxW && line.length) {
      // Drop the trailing space that would have hung past the right margin.
      while (line.length && line[line.length - 1].p === "space") line.pop();
      breakLine();
    }
    word.push(pc);
    wordW += w;
  }
  flushWord();
  while (line.length && line[line.length - 1].p === "space") line.pop();
  if (line.length) breakLine();
  return lines;
}
