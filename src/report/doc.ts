// The A4 page kernel both PDF documents are built on: the KINCAD kinematic report
// ([pdf.ts](pdf.ts)) and the CAD part sheet ([partsheet.ts](partsheet.ts)).
//
// WHY THIS IS A SEPARATE FILE. All of this lived inside `exportReportPDF` until the part sheet
// needed the same machinery. The one thing that must not be duplicated is `need()`: the report was
// once a fixed single page, and its "Design notes" section — the transmission-angle and
// non-rotating-input WARNINGS, the most consequential text in the document — silently ran off the
// bottom edge whenever the canvas snapshot was included. `need()` is the whole guard against that,
// and a second document with its own copy of it is a second document that can regress the same way.
//
// THE RULE FOR EVERY EMITTER HERE: call `need()` FIRST, with the height about to be drawn. That is
// why nothing in either document has to know in advance how long it will be.

import { jsPDF } from "jspdf";
import {
  compile,
  draw,
  headingStyle,
  labelStyle,
  mathStyle,
  measure,
  proseStyle,
  wrap,
  type Frag,
} from "./math";

/** Reserved strip at the foot of every page for the footer — content may not enter it. */
export const FOOTER_BAND = 46;

/** Tallest an embedded snapshot may be, in points — beyond this it crowds out the numbers. */
export const MAX_IMAGE_H = 300;

const MARGIN = 48;

/**
 * Baseline pitch of a wrapped body line. Named because `h2` reserves one of them below a heading and
 * `para` advances by one per line — the guarantee that a heading is never left alone at a page foot
 * is those two numbers agreeing, so they cannot be two literals in two places.
 */
const LINE_H = 12;

/** House colours, in the order they read on the page. */
const ACCENT: RGB = [107, 70, 193];
const INK: RGB = [20, 28, 38];
const LABEL: RGB = [90, 100, 112];
const BODY: RGB = [70, 80, 92];
const MONO: RGB = [50, 60, 75];
const QUIET: RGB = [120, 130, 140];
const FAINT: RGB = [140, 148, 158];
const GHOST: RGB = [175, 182, 190];

export type RGB = [number, number, number];

// ── what a standard PDF font can actually print ───────────────────────────────────────
//
// jsPDF's built-in fonts are single-byte WinAnsi Type1 fonts. Hand `text()` a character they cannot
// encode — ω, θ, ₂, −, √ — and jsPDF silently re-encodes THAT string as two-byte UTF-16BE while the
// font stays single-byte, so a viewer reads every high byte as its own glyph code: the symbol is
// gone and its neighbours are padded with notdefs. On screen the report reads
// "at ω₂ = 6.2832 rad/s"; the PDF read "at  = 6.2832 rad/s", and the Freudenstein block came out as
// "K cos() K cos() + K = cos( )". Found by opening a generated file — no assertion on the string
// passed IN can see it, because the damage happens inside the encoder.
//
// The first fix was to transliterate: `ω₂` printed as `omega2`. That was legible, and it was wrong
// for an engineering document — which is what [math.ts](math.ts) now exists to fix, by setting the
// Greek in the standard SYMBOL font and the subscripts as shifted small digits. Every emitter below
// goes through it.
//
// `pdfSafe` therefore stays, but only as the last-resort net BELOW that: it is installed inside
// `doc.text` itself, so a glyph math.ts has no mapping for — and anything a bespoke block draws by
// reaching for `sheet.doc` — still degrades to readable ASCII instead of silently vanishing.

/** WinAnsi beyond Latin-1: the 0x80–0x9F block, which jsPDF does map correctly (— is 0x97). */
const WIN_ANSI_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Upper-case forms are here because a heading is upper-cased before it is drawn, and
 * `"θ₂".toUpperCase()` is `"Θ₂"` — a different code point, which would slip past a lower-case map.
 * `math.ts` guards its own Greek against that; this net catches whatever does not go through it.
 */
const SYMBOLS: Record<string, string> = {
  θ: "theta", Θ: "THETA",
  ω: "omega", Ω: "OMEGA",
  α: "alpha", Α: "ALPHA",
  δ: "delta", Δ: "DELTA",
  π: "pi", Π: "PI",
  μ: "µ", Μ: "MU", // µ = MICRO SIGN (0xB5): the one Greek letter WinAnsi has
  ẋ: "x-dot", Ẋ: "X-DOT",
  ẍ: "x-ddot", Ẍ: "X-DDOT",
  "−": "-", // MINUS SIGN → hyphen-minus
  "→": "->",
  "≈": "~",
  "≤": "<=",
  "≥": ">=",
  "√": "sqrt",
  "∞": "infinite",
};

/**
 * Everything drawn on the page passes through here. An unmapped character becomes `?` rather than
 * disappearing: visible damage gets reported and mapped, silent damage shipped for a whole term.
 */
function pdfSafe(s: string): string {
  let out = "";
  for (const ch of s) {
    const sym = SYMBOLS[ch];
    if (sym !== undefined) {
      out += sym;
      continue;
    }
    const sub = SUBSCRIPTS.indexOf(ch);
    if (sub >= 0) {
      out += String(sub);
      continue;
    }
    out += ch.charCodeAt(0) <= 0xff || WIN_ANSI_HIGH.includes(ch) ? ch : "?";
  }
  return out;
}


export interface Sheet {
  /** The jsPDF instance, for the rare block that needs to draw something bespoke. */
  doc: jsPDF;
  /** Page width, height and margin, in points. */
  W: number;
  H: number;
  M: number;
  /** `dateStr` as it prints in the header; `dateSlug` as it appears in filenames. */
  dateStr: string;
  /** Guarantee `h` points of room below the cursor, breaking to a new page when there isn't any. */
  need: (h: number) => void;
  /** Vertical breathing room between blocks. Does NOT break a page — it is slack, not content. */
  gap: (h?: number) => void;
  /** Section heading, with an optional plain-case note beside it. */
  h2: (t: string, note?: string) => void;
  /** Label/value row. A one-letter word in the label is set as the variable it names. */
  kv: (k: string, v: string) => void;
  /** Wrapped body paragraph. */
  para: (t: string, color?: RGB) => void;
  /**
   * A displayed equation, typeset and centred in the text column. Write it the way it reads —
   * `"K₁ cos θ₄ − K₂ cos θ₂ + K₃ = cos(θ₂ − θ₄)"` — and pass `{ over, under }` for a fraction.
   */
  formula: (frags: Frag | Frag[], opts?: { size?: number; color?: RGB }) => void;
  /** A pre-aligned monospace line, for content whose columns carry meaning (a build tree). */
  mono: (t: string) => void;
  divider: () => void;
  /** Embed a PNG data URL, scaled from its OWN aspect ratio and centred. Silently skips a bad one. */
  image: (dataUrl: string) => void;
  /** Stamp `note` plus `Page n of m` on every page. Call once, after all content. */
  footer: (note: string) => void;
  /** Save as `<stem>-<date>.pdf`. */
  save: (stem: string) => void;
}

/**
 * Open a sheet and emit the shared header: rule, title, project subtitle, timestamp, attribution.
 * Both documents carry the same masthead — this is a final-year project report, and the sheet is
 * expected to identify itself and its author wherever it is printed.
 */
export function createSheet(title: string): Sheet {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Every string jsPDF is given goes through `pdfSafe` — including the two measurement calls, since
  // wrapping and heading offsets computed from the original text would be wrong for the text that
  // actually prints ("theta2" is wider than "θ₂"). Wrapped here rather than in each emitter so a
  // bespoke block reaching for `sheet.doc` cannot bypass it either.
  type Raw = (...a: unknown[]) => unknown;
  const rawText = doc.text.bind(doc) as Raw;
  const rawSplit = doc.splitTextToSize.bind(doc) as Raw;
  const rawWidth = doc.getTextWidth.bind(doc) as Raw;
  const safe = (t: unknown) =>
    Array.isArray(t) ? t.map((s: unknown) => pdfSafe(String(s))) : pdfSafe(String(t));
  doc.text = ((t: unknown, ...rest: unknown[]) => rawText(safe(t), ...rest)) as unknown as typeof doc.text;
  doc.splitTextToSize = ((t: unknown, ...rest: unknown[]) =>
    rawSplit(safe(t), ...rest)) as unknown as typeof doc.splitTextToSize;
  doc.getTextWidth = ((t: unknown) => rawWidth(safe(t))) as unknown as typeof doc.getTextWidth;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = MARGIN;
  let y = M;

  const need = (h: number) => {
    if (y + h > H - FOOTER_BAND) {
      doc.addPage();
      y = M;
    }
  };
  const gap = (h = 4) => {
    y += h;
  };

  const h1 = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(t, M, y);
    y += 8;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.5);
    doc.line(M, y, W - M, y);
    y += 18;
  };

  /**
   * The note is a separate argument rather than part of `t` because the heading is upper-cased for
   * style, and `"ω₂".toUpperCase()` is `"Ω₂"` — a different symbol, and in kinematics a wrong one.
   * `headingStyle` carries the guard: it upper-cases the Latin runs and leaves the Greek alone.
   */
  const h2 = (t: string, note?: string) => {
    // Heading plus one row, so a heading never sits alone at a page foot. 15 is a `kv` row, which is
    // the taller of the two things that follow a heading — a `para` line is `LINE_H`, so its first
    // line is covered by the same reservation.
    need(14 + 15);
    doc.setTextColor(...ACCENT);
    // `draw` returns the advance it consumed, which is what the note has to clear — the heading is
    // several runs at two sizes by the time a subscript is in it, so no single `getTextWidth` fits.
    const headW = draw(doc, compile(t, headingStyle(11)), M, y, ACCENT);
    if (note) {
      doc.setTextColor(...QUIET);
      draw(doc, compile(note, proseStyle(8.5)), M + headW + 10, y, QUIET);
    }
    y += 14;
  };

  const kv = (k: string, v: string) => {
    need(15);
    doc.setTextColor(...LABEL);
    draw(doc, compile(k, labelStyle(10)), M, y, LABEL);
    doc.setTextColor(...INK);
    draw(doc, compile(v, proseStyle(10)), M + 200, y, INK);
    y += 15;
  };

  /**
   * Wrapped body paragraph, FLOWING across a page break rather than moving as one block.
   *
   * It used to reserve its whole height at once, and that is how "UNITS AND SCALE" came to sit alone
   * at the foot of page 1 with all four of its lines overleaf: `h2` guarantees room for a heading
   * plus one row, and a paragraph that can only move in one piece is free to decline that room. Body
   * text continuing onto the next page is what a reader expects from a printed report; a section
   * heading stranded from its section reads as a document that lost a paragraph.
   */
  const para = (t: string, color: RGB = BODY) => {
    const lines = wrap(doc, compile(t, proseStyle(9.5)), W - 2 * M);
    doc.setTextColor(...color);
    for (const line of lines) {
      need(LINE_H);
      draw(doc, line, M, y, color);
      y += LINE_H;
    }
    y += 4;
  };

  /**
   * Centred in the text column, with the room it needs reserved from its own measured ink extents —
   * a stacked fraction is two lines tall and a radical adds an overbar, so a fixed row height would
   * either waste a third of the page or let a numerator collide with the line above.
   */
  const formula = (frags: Frag | Frag[], opts?: { size?: number; color?: RGB }) => {
    const col = W - 2 * M;
    const ink = opts?.color ?? INK;
    let size = opts?.size ?? 11;
    let pieces = compile(frags, mathStyle(size));
    let m = measure(doc, pieces);
    // Shrink to fit rather than overrun. An equation that runs past the right margin loses its
    // tail, and in `x = r₂ cos θ₂ + s` the tail is the part being solved for.
    if (m.w > col) {
      size = Math.max(7, (size * col) / m.w);
      pieces = compile(frags, mathStyle(size));
      m = measure(doc, pieces);
    }
    need(m.above + m.below + 12);
    y += m.above + 6;
    doc.setTextColor(...ink);
    draw(doc, pieces, M + Math.max(0, (col - m.w) / 2), y, ink);
    y += m.below + 6;
  };

  /**
   * Monospace, indented, drawn as one string. This is NOT for equations — it is for content that
   * has already been aligned into columns by whatever produced it, which in this app means the part
   * sheet's construction tree, where every glyph has to advance by the same width or the branches
   * stop lining up.
   */
  const mono = (t: string) => {
    need(16);
    doc.setFont("courier", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MONO);
    doc.text(t, M + 10, y);
    y += 16;
  };

  const divider = () => {
    need(14);
    y += 4;
    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 10;
  };

  // Scaled from the image's OWN aspect ratio. A hardcoded ratio here stretched or squashed the
  // drawing depending on the window shape, which in a CAD document reads as a geometry error.
  const image = (dataUrl: string) => {
    try {
      const props = doc.getImageProperties(dataUrl);
      let imgW = W - 2 * M;
      let imgH = imgW * (props.height / props.width);
      if (imgH > MAX_IMAGE_H) {
        imgH = MAX_IMAGE_H;
        imgW = imgH * (props.width / props.height);
      }
      need(imgH + 14);
      doc.addImage(dataUrl, "PNG", M + (W - 2 * M - imgW) / 2, y, imgW, imgH);
      y += imgH + 14;
    } catch {
      /* the snapshot is optional — a document without it is still correct */
    }
  };

  // Stamped after the content, because how many pages there are is only known then. The note is
  // wrapped rather than drawn as one line: at 7.5pt it is wider than the text column, so a single
  // `text()` call ran it off the right edge of the sheet.
  const footer = (note: string) => {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...GHOST);
      const lines = doc.splitTextToSize(note, W - 2 * M - 64); // 64pt kept clear for the page label
      doc.text(lines, M, H - 24 - (lines.length - 1) * 9);
      if (pages > 1) doc.text(`Page ${p} of ${pages}`, W - M, H - 24, { align: "right" });
    }
  };

  // ── the shared masthead ──────────────────────────────────────────────────
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  h1(title);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...QUIET);
  doc.text("AI-Assisted CAD-Based System for Kinematic Analysis & Synthesis of Planar Mechanisms", M, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...FAINT);
  doc.text(`Generated: ${dateStr}, ${timeStr}`, M, y);
  doc.text("FYP: Ibidun Quyum Babatunde · 2021/1/82451EM · FUT Minna, Dept. of Mechanical Engineering", M, y + 11);
  y += 26;

  return {
    doc,
    W,
    H,
    M,
    dateStr,
    need,
    gap,
    h2,
    kv,
    para,
    formula,
    mono,
    divider,
    image,
    footer,
    save: (stem: string) => doc.save(`${stem}-${dateStr.replace(/\s/g, "-")}.pdf`),
  };
}
