// Neither PDF document may run off the page, drop its snapshot, or print a symbol the font cannot
// render.
//
// WHY THIS FILE EXISTS. Four defects, all found by a human reading a generated file rather than by
// any test:
//
//  1. The "Design notes" section — the transmission-angle and non-rotating-input WARNINGS, the most
//     consequential text in the document — ran off the bottom edge whenever the canvas snapshot was
//     included. The page was a fixed single sheet; nothing checked that content fitted on it.
//  2. The snapshot was embedded at a hardcoded aspect ratio, so the drawing was stretched or squashed
//     depending on the window shape — which in a CAD document reads as a geometry error.
//  3. Every Greek letter and subscript vanished in the PDF: jsPDF re-encodes a string its single-byte
//     standard fonts cannot represent as UTF-16BE without changing the font, so "at ω₂ = 6.2832 rad/s"
//     printed as "at  = 6.2832 rad/s" and the Freudenstein equation lost all four of its symbols.
//  4. Solved joint angles printed as the raw `atan2` result while the results panel wrapped them, so
//     the same θ₃ read 55.5° on screen and −304.46° on the sheet. `degWrapped` is now the single
//     wrap both use.
//
// [doc.ts](../report/doc.ts) is the fix for the first three (`need()`, the aspect-ratio-preserving
// `image()` and — for 3 — [math.ts](../report/math.ts)); the fourth is `degWrapped` in the engine.
//
// HOW SYMBOL 3 IS FIXED, AND WHAT THAT MEANS FOR THIS FILE. The transliteration that first fixed it
// (`ω₂` → `omega2`) is gone. Greek is now set in the standard SYMBOL font, whose built-in encoding
// maps the ASCII byte `q` to θ and `w` to ω, and a subscript is a smaller digit on a lower baseline.
// So a row is no longer ONE `text()` call carrying one readable string — it is a dozen calls, each
// with its own font, size and baseline, and `"θ₂"` reaches the page as the byte `q` in F14 followed
// by `2` at 66% size, 2pt lower.
//
// `lines()` below is therefore the heart of this file: it clusters the recorded calls back into rows
// by baseline proximity, sorts each row by x, and DECODES what it finds — Symbol bytes back through
// Adobe's published encoding, small low digits back to ₀–₉, small high ones back to ⁰–⁹. The tables
// it decodes with are written out here from first principles rather than imported from math.ts, so
// this checks the encoding instead of agreeing with it. An expectation like
// `"Input angle  θ₂"` passing therefore means: those bytes, in those fonts, at those sizes, read
// back through the Symbol spec, spell that. Which is the only claim worth making about a PDF.
//
// TWO THINGS THIS PROBE HAS TO GET RIGHT, or it passes while the document is broken:
//
//  * THE PNG MUST BE REAL. `image()` swallows a snapshot it cannot decode — a correct choice for an
//    export, since a report without its picture is still a correct report. So a hand-picked 1×1
//    base64 PNG (jsPDF rejects most of them: "Error while decompressing the data: -3") makes every
//    image assertion vacuously pass. The fixture below is a genuinely well-formed PNG, and
//    `imageError` is asserted empty so a skipped image can never read as a pass.
//  * THE FOOTER IS *SUPPOSED* TO BE IN THE RESERVED BAND. It is the one thing drawn below
//    `H − FOOTER_BAND`, so the spill check has to exclude it — hence `Drawn.footer`.
//
// The recorded text is what reaches the PAGE, not what the document asked for: `createSheet` wraps
// `text()` with `pdfSafe` after jsPDF is constructed, so this probe — which wraps it inside the
// constructor — sees the final string. That is the point; it is the only layer that can.

import { beforeAll, describe, expect, it, vi } from "vitest";

/** One `doc.text()` call, as the page sees it. */
interface Drawn {
  page: number;
  /** Left edge. A subscript, a fraction's numerator and a row's value column all differ here. */
  x: number;
  /** Baseline of the first line. Shifted for a sub/superscript, and per level of a fraction. */
  y: number;
  /** Baseline of the LAST line — a wrapped footer note runs well past `y`. */
  bottom: number;
  /** The string as jsPDF encoded it: a Symbol run is an ASCII byte, a subscript a bare digit. */
  text: string;
  /** The font actually selected for this run — `"symbol"` is how a Greek letter is drawn. */
  font: string;
  size: number;
  /** Drawn by `footer()`, which lives inside the reserved band on purpose. */
  footer: boolean;
}

/** A vector stroke. The fraction rules, the radical's tick and overbar, and the page dividers. */
interface Stroke {
  page: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A filled dot — the overdot of `ẋ`, which has no character to be recorded as. */
interface Dot {
  page: number;
  x: number;
  y: number;
  r: number;
}

/**
 * What the instrumented jsPDF records. `vi.hoisted` because `vi.mock`'s factory is lifted above the
 * imports and has to be able to close over it.
 */
const probe = vi.hoisted(() => ({
  drawn: [] as Drawn[],
  /** `line()` and `circle()` calls. A radical and an overdot exist ONLY here — see `Stroke`. */
  strokes: [] as Stroke[],
  dots: [] as Dot[],
  images: [] as { x: number; y: number; w: number; h: number }[],
  /** Whatever `image()`'s catch swallowed. Must stay empty — see the note above. */
  imageError: "",
  saved: [] as string[],
  W: 0,
  H: 0,
  pages: 0,
  /** Non-zero once `footer()` starts stamping; it is the only caller of `setPage`. */
  footerPage: 0,
}));

vi.mock("jspdf", async () => {
  const actual = await vi.importActual<typeof import("jspdf")>("jspdf");

  /**
   * The instance seen as a bag of methods. jsPDF assigns its whole API as OWN properties in the
   * constructor — `jsPDF.prototype.text` is `undefined` — so a method overridden on a subclass's
   * prototype would never be reached. Wrapping the instance after `super()` is the only way in.
   */
  type Bag = Record<string, (...a: unknown[]) => unknown>;

  class ProbeDoc extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      const self = this as unknown as Bag;
      probe.W = this.internal.pageSize.getWidth();
      probe.H = this.internal.pageSize.getHeight();

      const text = self.text.bind(this);
      self.text = (...a: unknown[]) => {
        const first = a[0];
        const lines = Array.isArray(first) ? (first as string[]) : [String(first)];
        const y = a[2] as number;
        const lead = this.getFontSize() * this.getLineHeightFactor();
        probe.drawn.push({
          // `need()` only ever appends, so while content is being emitted the page count IS the
          // current page. Once the footer starts, `setPage` has just said which page explicitly.
          page: probe.footerPage || this.getNumberOfPages(),
          x: a[1] as number,
          y,
          bottom: y + (lines.length - 1) * lead,
          text: lines.join(" "),
          // Read from the doc rather than passed in: this is the font the run was ACTUALLY drawn
          // with, which is the only way to tell a Symbol `q` from a Helvetica one.
          font: this.getFont().fontName,
          size: this.getFontSize(),
          footer: probe.footerPage > 0,
        });
        return text(...a);
      };

      const setPage = self.setPage.bind(this);
      self.setPage = (...a: unknown[]) => {
        probe.footerPage = a[0] as number;
        return setPage(...a);
      };

      // The two glyphs that are geometry rather than text: a fraction's rule and a radical's tick
      // and overbar are `line()` calls, and an overdot is a filled `circle()`. Nothing in `drawn`
      // can see either, so a formula that lost its rule — or a √ that printed as a bare radicand —
      // would pass every text assertion in this file.
      const line = self.line.bind(this);
      self.line = (...a: unknown[]) => {
        probe.strokes.push({
          page: probe.footerPage || this.getNumberOfPages(),
          x1: a[0] as number,
          y1: a[1] as number,
          x2: a[2] as number,
          y2: a[3] as number,
        });
        return line(...a);
      };

      const circle = self.circle.bind(this);
      self.circle = (...a: unknown[]) => {
        probe.dots.push({
          page: probe.footerPage || this.getNumberOfPages(),
          x: a[0] as number,
          y: a[1] as number,
          r: a[2] as number,
        });
        return circle(...a);
      };

      const getImageProperties = self.getImageProperties.bind(this);
      self.getImageProperties = (...a: unknown[]) => {
        try {
          return getImageProperties(...a);
        } catch (e) {
          probe.imageError = String(e); // the document swallows this; the test must not
          throw e;
        }
      };

      const addImage = self.addImage.bind(this);
      self.addImage = (...a: unknown[]) => {
        try {
          const out = addImage(...a);
          probe.images.push({
            x: a[2] as number,
            y: a[3] as number,
            w: a[4] as number,
            h: a[5] as number,
          });
          return out;
        } catch (e) {
          probe.imageError = String(e);
          throw e;
        }
      };

      // node has no `saveAs`, and a test wants no file — record the name and the final page count.
      self.save = (...a: unknown[]) => {
        probe.saved.push(String(a[0]));
        probe.pages = this.getNumberOfPages();
        return this;
      };
    }
  }

  return { ...actual, jsPDF: ProbeDoc, default: ProbeDoc };
});

import { buildCad } from "../cad/build";
import type { CadModel } from "../cad/types";
import { analyzeFourBar, degWrapped, toDeg } from "../engine";
import type { FourBarLinkage, FourBarReport, SliderCrankReport } from "../engine";
import { reportFor } from "../insight";
import { FOOTER_BAND, MAX_IMAGE_H } from "../report/doc";
import { exportPartSheetPDF } from "../report/partsheet";
import { exportReportPDF } from "../report/pdf";
import { DEFAULT_FOURBAR, DEFAULT_OMEGA2, DEFAULT_SLIDER, INITIAL_STATE } from "../state";
import type { WorkspaceState } from "../state";

// ── a PNG jsPDF will actually decode ─────────────────────────────────────────────────
//
// Built by hand out of `Uint8Array` and `btoa` rather than `Buffer` and `node:zlib`, because
// `tsconfig.app.json` compiles `src` against browser libs alone (`lib: ES2023 + DOM`,
// `types: vite/client`) — deliberately, so that nothing under `src` can reach for a node API by
// accident. So the scanlines go into STORED (uncompressed) deflate blocks: the fixture has to be a
// *valid* PNG, not a small one, and a stored stream is a legal one that needs no compressor.

const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function crc32(d: number[]): number {
  let c = ~0;
  for (const b of d) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: number[]): number[] {
  const body = [...ascii(type), ...data];
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/** The zlib checksum. Wrong here and the decoder rejects the whole image. */
function adler32(d: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of d) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** `data` as a zlib stream of stored deflate blocks: 2-byte header, blocks, Adler-32. */
function zlibStored(data: Uint8Array): number[] {
  const MAX = 0xffff; // a stored block's length field is 16 bits
  const out = [0x78, 0x01]; // deflate, 32K window, no preset dictionary
  for (let off = 0; off < data.length; off += MAX) {
    const len = Math.min(MAX, data.length - off);
    const nlen = ~len & 0xffff; // LEN's one's complement, which the decoder verifies
    const last = off + len >= data.length ? 1 : 0; // BFINAL, with BTYPE 00 = stored
    out.push(last, len & 0xff, (len >> 8) & 0xff, nlen & 0xff, (nlen >> 8) & 0xff);
    for (let i = 0; i < len; i++) out.push(data[off + i]);
  }
  return [...out, ...be32(adler32(data))];
}

/** A real 8-bit RGB PNG data URL: signature, IHDR, the scanlines, IEND. */
function png(w: number, h: number): string {
  const stride = 1 + w * 3;
  const raw = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * stride + 1 + x * 3; // byte 0 of each scanline is the filter type (0 = none)
      raw[o] = (x * 9) & 0xff;
      raw[o + 1] = (y * 5) & 0xff;
      raw[o + 2] = 0x80;
    }
  }
  const file = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [...be32(w), ...be32(h), 8 /* bit depth */, 2 /* truecolour RGB */, 0, 0, 0]),
    ...chunk("IDAT", zlibStored(raw)),
    ...chunk("IEND", []),
  ];
  let s = "";
  for (const b of file) s += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(s)}`;
}

/** Deliberately not 4:3 or 16:9, so a hardcoded ratio anywhere would show up as a mismatch. */
const SNAP_W = 71;
const SNAP_H = 29;
const SNAPSHOT = png(SNAP_W, SNAP_H);

/** A portrait capture — a tall window, or the CAD view of a tall part. Exercises the height clamp. */
const TALL_W = 40;
const TALL_H = 130;
const TALL = png(TALL_W, TALL_H);

// ── fixtures ─────────────────────────────────────────────────────────────────────────

/** Non-Grashof: the input cannot fully rotate and μ collapses, so the engine emits warnings. */
const CRAMPED: FourBarLinkage = {
  ground: 4,
  input: 3,
  coupler: 1.5,
  output: 2,
  couplerPointDist: 1,
  couplerPointAngle: 0.6,
  circuit: "open",
};

const state = (p: Partial<WorkspaceState> = {}): WorkspaceState => ({ ...INITIAL_STATE, ...p });

const FOURBAR = state();
const SLIDER = state({ kind: "slidercrank" });
const WARNED = state({ fourbar: CRAMPED });

/**
 * A workspace that declares INCHES — the document that proves the unit on the page is the declared
 * one rather than a hardcoded `mm`. Slider-crank, because that mechanism is the one with a linear
 * velocity and acceleration to label, and because its scale-free note must name `r₂ : r₃ : e` and no
 * r₄. `in` is also the unit that catches the prose defect the symbol alone would ship: "stated in in".
 */
const INCHES = state({ kind: "slidercrank", unit: "in" });

const PART: CadModel = {
  name: "Test Bracket",
  node: {
    type: "difference",
    children: [
      { type: "box", size: ["width", "height", 12] },
      { type: "cylinder", radius: "bore", height: 40, transform: { rotate: [90, 0, 0] } },
    ],
  },
  params: [
    { key: "width", label: "Width", value: 60, min: 20, max: 120, unit: "mm" },
    { key: "height", label: "Height", value: 40, min: 10, max: 80, unit: "mm" },
    { key: "bore", label: "Bore radius", value: 8, min: 2, max: 20, unit: "mm" },
  ],
};

// ── rendering ────────────────────────────────────────────────────────────────────────

interface Rendered {
  drawn: Drawn[];
  content: Drawn[];
  /** The content runs reassembled into rows — see `lines()`. Footer rows are excluded. */
  rows: Row[];
  strokes: Stroke[];
  dots: Dot[];
  images: { x: number; y: number; w: number; h: number }[];
  imageError: string;
  saved: string[];
  W: number;
  H: number;
  pages: number;
  /** The lowest baseline content may occupy. */
  floor: number;
}

// ── reading the page back ─────────────────────────────────────────────────────────────
//
// Adobe's Symbol encoding and the shifted-digit convention, in reverse. Written out from the
// published spec rather than imported from math.ts, so a wrong entry there fails here instead of
// agreeing. This is the whole basis on which an expectation below may be written in real symbols.

const FROM_SYMBOL: Record<string, string> = {
  a: "α", b: "β", g: "γ", d: "δ", e: "ε", z: "ζ", h: "η", q: "θ",
  l: "λ", m: "μ", n: "ν", x: "ξ", p: "π", r: "ρ", s: "σ", t: "τ",
  f: "φ", c: "χ", y: "ψ", w: "ω",
  G: "Γ", D: "Δ", Q: "Θ", L: "Λ", X: "Ξ", P: "Π", S: "Σ", F: "Φ", Y: "Ψ", W: "Ω",
  "-": "−", // Symbol's 0x2D is `minus`, not the hyphen WinAnsi puts there
};
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * How far a run's baseline may sit from its row's and still belong to it. A subscript drops 0.20em
 * and a superscript rises 0.36em, so a row's ink spans ~0.56em — 5.6pt at the 10pt of a `kv` row.
 * The tightest row PITCH in either document is 12pt (a wrapped paragraph), whose own superscript
 * therefore lands 8.6pt below the row above's subscript. 4.6 separates those two facts.
 */
const ROW_TOL = 4.6;

/** Where `kv` puts the value column — `M + 200` in doc.ts. The label is everything left of it. */
const VALUE_X = 248;

/** One decoded run, keeping its left edge so a row can still be split by column. */
interface Cell {
  x: number;
  text: string;
  run: Drawn;
}

interface Row {
  page: number;
  /** Baseline of the row's body text, ignoring the shifted runs. */
  y: number;
  /** Left edge of the leftmost run, and of the RIGHTMOST one — together these locate the row. */
  x: number;
  lastX: number;
  /** The row as a reader sees it, decoded back into Unicode. */
  text: string;
  cells: Cell[];
}

/** Everything from `from` up to `to` points across, joined — the row's label, or its value. */
const span = (l: Row, from: number, to: number) =>
  l.cells.filter((c) => c.x >= from && c.x < to).map((c) => c.text).join("").trim();

/**
 * Cluster the recorded runs back into rows and decode them.
 *
 * Rows are found by baseline proximity rather than by instrumenting the emitters, because the
 * emitters have no idea either: `draw` walks a compiled line and each piece picks its own baseline.
 * A stacked fraction consequently resolves to THREE rows — numerator, main, denominator — which is
 * not a shortcoming but the assertion that it is stacked at all.
 */
function lines(all: Drawn[]): Row[] {
  const sorted = all.slice().sort((p, q) => p.page - q.page || p.y - q.y || p.x - q.x);
  const out: Row[] = [];
  let group: Drawn[] = [];

  const flush = () => {
    if (!group.length) return;
    // The body size is the largest in the row, and its baseline is the row's — a subscript is
    // defined relative to the text it hangs off, not to the top of the cluster.
    const body = Math.max(...group.map((d) => d.size));
    const baseY = group.find((d) => d.size === body)!.y;
    const cells = group
      .slice()
      .sort((p, q) => p.x - q.x)
      .map((d): Cell => ({ x: d.x, run: d, text: decode(d, body, baseY) }));
    out.push({
      page: group[0].page,
      y: baseY,
      x: cells[0].x,
      lastX: cells[cells.length - 1].x,
      text: cells.map((c) => c.text).join(""),
      cells,
    });
    group = [];
  };

  for (const d of sorted) {
    const prev = group[group.length - 1];
    if (prev && (d.page !== prev.page || d.y - prev.y > ROW_TOL)) flush();
    group.push(d);
  }
  flush();
  return out;
}

/** One run back into Unicode: Symbol bytes through Adobe's encoding, small digits by their shift. */
function decode(d: Drawn, body: number, baseY: number): string {
  if (d.font === "symbol") {
    // An unmapped byte is spelled out rather than dropped: a wrong code point must stay visible.
    return [...d.text].map((c) => FROM_SYMBOL[c] ?? `<0x${c.charCodeAt(0).toString(16)}>`).join("");
  }
  // Small AND shifted. Small alone is not enough: an `h2` note is 8.5pt beside an 11pt heading and
  // sits on the heading's own baseline, so size alone read "at ω₂ = 6.2832 rad/s" as an exponent.
  if (d.size < body * 0.9 && Math.abs(d.y - baseY) > 0.5) {
    const table = d.y > baseY ? SUB : SUP;
    return [...d.text].map((c) => (/\d/.test(c) ? table[Number(c)] : c)).join("");
  }
  return d.text;
}

/** Generate one document and copy the recording out, so the next one cannot disturb it. */
function render(emit: () => void): Rendered {
  probe.drawn.length = 0;
  probe.strokes.length = 0;
  probe.dots.length = 0;
  probe.images.length = 0;
  probe.saved.length = 0;
  probe.imageError = "";
  probe.pages = 0;
  probe.footerPage = 0;

  emit();

  const drawn = probe.drawn.slice();
  const content = drawn.filter((d) => !d.footer);
  return {
    drawn,
    content,
    rows: lines(content),
    strokes: probe.strokes.slice(),
    dots: probe.dots.slice(),
    images: probe.images.slice(),
    imageError: probe.imageError,
    saved: probe.saved.slice(),
    W: probe.W,
    H: probe.H,
    pages: probe.pages,
    floor: probe.H - FOOTER_BAND,
  };
}

/**
 * A section heading, identified by how it is DRAWN rather than by what it says: bold sans at 11pt
 * starting at the left margin. The masthead is 16pt, a `kv` label 10pt, a paragraph line 9.5pt and a
 * formula is serif — so this size, in this font, at this x, is an `h2` and nothing else.
 */
const isHeading = (l: Row) =>
  l.x === 48 && l.cells[0].run.size === 11 && l.cells[0].run.font === "helvetica";

/** Every document is subject to these, whatever it contains. */
function expectSound(r: Rendered) {
  const spill = r.content
    .filter((d) => d.bottom > r.floor)
    .map((d) => `p${d.page} @ ${d.bottom.toFixed(0)}pt: ${d.text.slice(0, 70)}`);
  expect(spill, `content below the footer band (floor ${r.floor.toFixed(0)}pt)`).toEqual([]);

  expect(r.pages).toBeGreaterThan(0);
  expect(r.content.length, "a document that drew almost nothing would pass every other check")
    .toBeGreaterThan(20);

  for (let p = 1; p <= r.pages; p++) {
    const foot = r.drawn.filter((d) => d.footer && d.page === p);
    expect(foot.length, `page ${p} carries no footer`).toBeGreaterThan(0);
    // The note is wrapped rather than drawn as one line — at 7.5pt it is wider than the text
    // column, and a single `text()` call ran it off the right edge of the sheet.
    for (const f of foot) {
      expect(f.y, `page ${p} footer rises into the content area`).toBeGreaterThanOrEqual(r.floor);
      expect(f.bottom, `page ${p} footer runs off the bottom of the sheet`).toBeLessThanOrEqual(r.H - 10);
    }
    if (r.pages > 1) {
      expect(foot.some((f) => f.text === `Page ${p} of ${r.pages}`), `page ${p} is unnumbered`).toBe(true);
    }
  }

  expect(r.saved).toHaveLength(1);
  expect(r.saved[0]).toMatch(/\.pdf$/);

  // No page may END on a heading. `h2` reserves a row below itself for exactly this reason, and the
  // rule was broken the moment a section's body was a paragraph: `para` used to reserve its whole
  // height and move as one block, so "UNITS AND SCALE" printed alone at the foot of page 1 with all
  // four of its lines overleaf. Found by reading a generated file, like every other defect here.
  for (let p = 1; p <= r.pages; p++) {
    const onPage = r.rows.filter((l) => l.page === p);
    const last = onPage[onPage.length - 1];
    expect(
      Boolean(last && isHeading(last)),
      `page ${p} of ${r.pages} ends with the heading "${last?.text}" — its section starts overleaf`,
    ).toBe(false);
  }
}

/** The snapshot must be embedded, inside the margins, at its own aspect ratio. */
function expectSnapshot(r: Rendered, w = SNAP_W, h = SNAP_H) {
  expect(r.imageError, "the document swallowed the snapshot instead of embedding it").toBe("");
  expect(r.images).toHaveLength(1);
  const img = r.images[0];
  expect(img.w / img.h).toBeCloseTo(w / h, 3);
  expect(img.h).toBeLessThanOrEqual(MAX_IMAGE_H);
  expect(img.x).toBeGreaterThanOrEqual(48); // the page margin
  expect(img.x + img.w).toBeLessThanOrEqual(r.W - 48 + 0.001);
  expect(img.y + img.h).toBeLessThanOrEqual(r.floor);
}

/** Present anywhere in the document, as a reader would read it — decoded, spaces and all. */
const has = (r: Rendered, needle: string) => r.rows.some((l) => l.text.includes(needle));

/**
 * The whole document as one string, for a sentence that does not fit on one line. A wrapped paragraph
 * is several rows, so `has` cannot see a needle that straddles a break; whitespace is normalised
 * because the break is not something a reader sees either.
 */
const flat = (r: Rendered) => r.rows.map((l) => l.text).join(" ").replace(/\s+/g, " ");

/**
 * The value of a `kv` row, found by COLUMN rather than by call order: a label with a subscript in it
 * is several `text()` calls, so "the next call after the label" is now the label's own subscript.
 */
function valueOf(r: Rendered, label: string): string {
  const row = r.rows.find((l) => span(l, 0, VALUE_X) === label);
  expect(row, `no "${label}" row`).toBeDefined();
  return span(row!, VALUE_X, Infinity);
}

// ── the documents ────────────────────────────────────────────────────────────────────

let fourbar: Rendered;
let slider: Rendered;
let warned: Rendered;
let plain: Rendered;
let portrait: Rendered;
let overflowing: Rendered;
let inches: Rendered;
let sheet: Rendered;

beforeAll(() => {
  fourbar = render(() => exportReportPDF(reportFor(FOURBAR, DEFAULT_OMEGA2), SNAPSHOT, FOURBAR));
  slider = render(() => exportReportPDF(reportFor(SLIDER, DEFAULT_OMEGA2), SNAPSHOT, SLIDER));
  warned = render(() => exportReportPDF(reportFor(WARNED, DEFAULT_OMEGA2), SNAPSHOT, WARNED));
  plain = render(() => exportReportPDF(reportFor(FOURBAR, DEFAULT_OMEGA2), undefined, FOURBAR));
  portrait = render(() => exportReportPDF(reportFor(FOURBAR, DEFAULT_OMEGA2), TALL, FOURBAR));
  inches = render(() => exportReportPDF(reportFor(INCHES, DEFAULT_OMEGA2), SNAPSHOT, INCHES));

  // Synthetic warnings, purely to force a page break — the multi-page path (page numbers, a footer
  // on every sheet, content that continues past the first floor) is otherwise untested, and running
  // off the bottom of page 1 is the exact defect this file is here for.
  const long = {
    ...reportFor(FOURBAR, DEFAULT_OMEGA2),
    warnings: Array.from(
      { length: 30 },
      (_, i) =>
        `Synthetic note ${i + 1} of 30 — long enough to wrap across the full text column so the ` +
        `design-notes block cannot fit on a single sheet alongside the snapshot above it.`,
    ),
  };
  overflowing = render(() => exportReportPDF(long, SNAPSHOT, FOURBAR));

  const built = buildCad(PART.node, undefined, PART.params);
  sheet = render(() => exportPartSheetPDF(PART, built, SNAPSHOT));
});

describe("the kinematic report stays on the page", () => {
  it("four-bar, with a snapshot", () => {
    expectSound(fourbar);
    expectSnapshot(fourbar);
    expect(fourbar.saved[0]).toMatch(/^kincad-report-fourbar-/);
  });

  it("slider-crank, with a snapshot", () => {
    expectSound(slider);
    expectSnapshot(slider);
    expect(slider.saved[0]).toMatch(/^kincad-report-slidercrank-/);
  });

  it("without a snapshot — nothing embedded, nothing swallowed", () => {
    expectSound(plain);
    expect(plain.images).toHaveLength(0);
    expect(plain.imageError).toBe("");
  });

  it("a portrait snapshot is capped in height, not stretched to the column", () => {
    // A tall window's capture would otherwise be scaled to the full text width and stand ~1620pt
    // high — twice the sheet — pushing every number in the document onto later pages.
    expectSound(portrait);
    expectSnapshot(portrait, TALL_W, TALL_H);
    expect(portrait.images[0].h, "the height clamp did not engage").toBe(MAX_IMAGE_H);
    expect(portrait.images[0].w).toBeLessThan(portrait.W - 96);
  });

  it("with engine warnings — the drawing AND every warning fit", () => {
    expectSound(warned);
    expectSnapshot(warned);
    const warnings = reportFor(WARNED, DEFAULT_OMEGA2).warnings;
    expect(warnings.length, "the fixture stopped producing warnings, so this test proves nothing")
      .toBeGreaterThan(0);
    for (const w of warnings) expect(has(warned, w.slice(0, 30))).toBe(true);
  });

  it("across a page break — every page numbered and footed, nothing lost", () => {
    expect(overflowing.pages, "the fixture no longer overflows a page").toBeGreaterThan(1);
    expectSound(overflowing);
    expectSnapshot(overflowing);
    expect(has(overflowing, "Synthetic note 30 of 30")).toBe(true);
    expect(overflowing.content.some((d) => d.page === overflowing.pages)).toBe(true);
  });

  it("a sheet declared in inches — the unit does not change the layout", () => {
    // Every length on this one is a character wider than the same figure in `mm` would be, and the
    // scale-free note adds a paragraph the sheet did not used to carry.
    expectSound(inches);
    expectSnapshot(inches);
    expect(inches.saved[0]).toMatch(/^kincad-report-slidercrank-/);
  });
});

describe("the kinematic report states the speed it swept at", () => {
  it("labels the full-cycle block with ω₂ in both units", () => {
    // The heading is upper-cased for style but the note beside it is not, because "ω₂".toUpperCase()
    // is "Ω₂" — a different symbol, and in kinematics the wrong one. `headingStyle` carries the guard.
    expect(has(fourbar, "FULL-CYCLE KINEMATIC SUMMARY")).toBe(true);
    expect(has(fourbar, `at ω₂ = ${DEFAULT_OMEGA2.toFixed(4)} rad/s`)).toBe(true);
    expect(has(fourbar, "(60.0 rev/min)")).toBe(true);
  });

  it("prints the coupler-point geometry, without which the envelope cannot be checked", () => {
    expect(valueOf(fourbar, "Coupler point  p  (from A)")).toContain(
      DEFAULT_FOURBAR.couplerPointDist.toFixed(4),
    );
    expect(has(fourbar, "Assembly circuit")).toBe(true);
  });

  it("documents the method the mechanism actually used, not the other one", () => {
    expect(has(fourbar, "K₁ cos θ₄ − K₂ cos θ₂ + K₃ = cos(θ₂ − θ₄)")).toBe(true);
    expect(has(slider, "K₁ cos θ₄")).toBe(false);
    expect(has(slider, "g = e − r₂ sin θ₂")).toBe(true);
    expect(valueOf(slider, "Connecting rod  r₃")).toContain(DEFAULT_SLIDER.rod.toFixed(4));
  });
});

describe("the report reads the same as the screen", () => {
  /** The angle rows the solvers produce, as opposed to the ones the user typed in. */
  const SOLVED = ["Input angle  θ₂", "Coupler angle  θ₃", "Output angle  θ₄"] as const;

  it("prints solved joint angles on [0, 360), the way the results panel does", () => {
    for (const label of SOLVED) {
      const printed = valueOf(fourbar, label);
      expect(printed, `${label} is not a plain degree value`).toMatch(/^-?\d+\.\d{2}°$/);
      const deg = Number(printed.replace("°", ""));
      expect(deg, `${label} printed ${printed}, outside [0, 360)`).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThan(360);
    }
  });

  it("agrees with the engine, and the fixture really does need the wrap", () => {
    const st = analyzeFourBar(FOURBAR.fourbar, FOURBAR.theta2, FOURBAR.omega2);

    // Without this, the test above passes on a fixture whose raw angles happen to land in range and
    // proves nothing. The solvers return `atan2` results, so at the default pose θ₃ is −304.46°.
    expect(toDeg(st.theta3), "the fixture no longer exercises the wrap").toBeLessThan(0);

    expect(valueOf(fourbar, "Coupler angle  θ₃")).toBe(`${degWrapped(st.theta3).toFixed(2)}°`);
    expect(valueOf(fourbar, "Output angle  θ₄")).toBe(`${degWrapped(st.theta4).toFixed(2)}°`);
    // Panel.tsx's `fmtDeg` and Plots.tsx both route through the same `degWrapped`, which is what
    // keeps the sheet and the screen from disagreeing about an angle again.
    expect(valueOf(slider, "Rod angle  θ₃")).toMatch(/^\d+\.\d{2}°$/);
  });
});

// ── the declared length unit ─────────────────────────────────────────────────────────
//
// "i thought you talks about this Units stuffs, why are you putting 'units' as phase instead of the
// exact units?" — the sheet printed `4.0000 units`, an envelope in `units²`, and slider velocities
// with no unit at all. `units` is not a unit; on a marking sheet it reads as a placeholder nobody
// replaced. The workspace now DECLARES one ([units.ts](../units.ts)) and every figure prints it.
//
// The declaration is a label, not a conversion — which is why `inches` here is the load-bearing
// document: a hardcoded `mm` would pass every assertion written against `fourbar` alone.

describe("every length carries the workspace's declared unit", () => {
  // Cast rather than narrowed, as insight.test.ts does: these are the reports the two documents were
  // built from, and the figures on the page are compared back to THEM rather than to a literal.
  const four = reportFor(FOURBAR, DEFAULT_OMEGA2) as FourBarReport;
  const crank = reportFor(INCHES, DEFAULT_OMEGA2) as SliderCrankReport;

  it("declares the unit beside the dimensions, spelled out", () => {
    // Spelled out because the symbol gives "declared in in" for inches — true, and unreadable. The
    // rows under the heading still carry the symbol, which is what a column of figures wants.
    expect(has(fourbar, "LINK DIMENSIONS")).toBe(true);
    expect(has(fourbar, "declared in millimetres")).toBe(true);
    expect(has(inches, "declared in inches")).toBe(true);
    expect(flat(inches), "a unit symbol is being read as a word").not.toMatch(/\bin in\b/);
  });

  it("prints the symbol on every link dimension, in the unit that was declared", () => {
    expect(valueOf(fourbar, "Ground  r₁")).toBe(`${DEFAULT_FOURBAR.ground.toFixed(4)} mm`);
    expect(valueOf(fourbar, "Input crank  r₂")).toBe(`${DEFAULT_FOURBAR.input.toFixed(4)} mm`);
    expect(valueOf(fourbar, "Coupler  r₃")).toBe(`${DEFAULT_FOURBAR.coupler.toFixed(4)} mm`);
    expect(valueOf(fourbar, "Output rocker  r₄")).toBe(`${DEFAULT_FOURBAR.output.toFixed(4)} mm`);
    expect(valueOf(fourbar, "Coupler point  p  (from A)")).toBe(
      `${DEFAULT_FOURBAR.couplerPointDist.toFixed(4)} mm`,
    );

    // The declared unit, not the default: this sheet was exported from an inch-declared workspace.
    expect(valueOf(inches, "Crank  r₂")).toBe(`${DEFAULT_SLIDER.crank.toFixed(4)} in`);
    expect(valueOf(inches, "Connecting rod  r₃")).toBe(`${DEFAULT_SLIDER.rod.toFixed(4)} in`);
    expect(valueOf(inches, "Slider offset  e")).toBe(`${DEFAULT_SLIDER.offset.toFixed(4)} in`);

    // An angle is not a length. No declaration can change what one is measured in, and the coupler
    // point's δ₃ sits in the same block as the four lengths above it.
    expect(valueOf(inches, "Input angle  θ₂")).toMatch(/^\d+\.\d{2}°$/);
    expect(valueOf(fourbar, "Coupler point angle  δ₃")).toMatch(/^-?\d+\.\d{2}° {2}from r₃$/);
    expect(valueOf(fourbar, "Output speed  ω₄")).toMatch(/rad\/s$/);
  });

  it("labels the linear rows per second and per second squared", () => {
    // The one thing the declaration does affect: both scale with the length unit, so a velocity is
    // (declared unit)/s. They used to print as bare numbers, which is the same defect as `units`.
    expect(valueOf(inches, "Slider position  x")).toMatch(/^-?\d+\.\d{6} in$/);
    expect(valueOf(inches, "Slider velocity  x")).toMatch(/^-?\d+\.\d{6} in\/s$/);
    expect(valueOf(inches, "Slider acceleration  x")).toMatch(/^-?\d+\.\d{6} in\/s²$/);

    expect(valueOf(inches, "Slider stroke")).toBe(`${crank.stroke.toFixed(4)} in`);
    expect(valueOf(inches, "Slider velocity (min / max)")).toContain("in/s");
    expect(valueOf(inches, "Slider acceleration (min / max)")).toContain("in/s²");
    // ω and α are rad/s whatever the length unit is — the whole point of the note below.
    expect(valueOf(inches, "Input speed  ω₂")).toContain("rad/s");
  });

  it("states the coupler envelope as a size, not as an area", () => {
    // `≈ 3.21 × 1.84 units²` used to print here. A bounding box is a size; `w × h` is not an area,
    // and an area is not what the engine measured. One unit, stated once, after the height.
    expect(four.kind, "the four-bar fixture stopped being a four-bar").toBe("fourbar");
    expect(valueOf(fourbar, "Coupler-curve envelope")).toBe(
      `${four.couplerExtent.width.toFixed(3)} × ${four.couplerExtent.height.toFixed(3)} mm  (bounding box)`,
    );
    expect(valueOf(fourbar, "Coupler-curve envelope")).not.toContain("²");
  });

  it("says on the page that the analysis is scale-free, in the mechanism's own ratios", () => {
    // Without this section a reader could reasonably infer the solver was handed millimetres and
    // worked in them. It was not — the unit is the engineer's statement about their own numbers.
    expect(has(fourbar, "UNITS AND SCALE")).toBe(true);
    expect(flat(fourbar)).toContain(
      "Lengths are stated in millimetres (mm), the unit declared for this workspace.",
    );
    expect(flat(inches)).toContain("Lengths are stated in inches (in), the unit declared");

    expect(flat(fourbar)).toContain("depend only on the ratios r₁ : r₂ : r₃ : r₄.");
    // The slider-crank has no r₄, and naming one is the defect that split the equations section:
    // a sheet documenting a link the mechanism does not have is documenting a different mechanism.
    expect(flat(inches)).toContain("depend only on the ratios r₂ : r₃ : e.");
    expect(flat(inches), "the slider-crank sheet names an r₄ it does not have").not.toContain("r₄");
  });
});

describe("the CAD part sheet", () => {
  it("stays on the page and files itself under the model name", () => {
    expectSound(sheet);
    expectSnapshot(sheet);
    expect(sheet.saved[0]).toMatch(/^kincad-partsheet-test-bracket-/);
  });

  it("reports the geometry the mesh was actually built from", () => {
    // 60 × 40 × 12 are the parameter values resolved through the node tree — a sheet that printed
    // the unresolved dimension names, or a default, would be describing a different part.
    expect(valueOf(sheet, "Bounding box")).toBe("60.00 × 40.00 × 12.00 mm");
    expect(valueOf(sheet, "Construction")).toBe("2 solids, 1 boolean operation");
    expect(Number(valueOf(sheet, "Mesh triangles").replace(/,/g, ""))).toBeGreaterThan(0);
  });

  it("tabulates every parameter with its unit and adjustable range", () => {
    expect(valueOf(sheet, "Width")).toBe("60 mm        (20 mm – 120 mm)");
    expect(valueOf(sheet, "Height")).toBe("40 mm        (10 mm – 80 mm)");
    expect(valueOf(sheet, "Bore radius")).toBe("8 mm        (2 mm – 20 mm)");
  });

  it("prints the construction tree, tying each dimension back to its parameter", () => {
    expect(has(sheet, "difference")).toBe(true);
    expect(has(sheet, "box        width × height × 12.00")).toBe(true);
    expect(has(sheet, "cylinder   r bore   h 40.00")).toBe(true);
  });

  it("says which formats exist and why STEP does not", () => {
    expect(has(sheet, "STEP and IGES are not offered")).toBe(true);
  });
});

// ── the symbols that reach the page ──────────────────────────────────────────────────

/**
 * Every character a WinAnsi standard font can encode: printable Latin-1, plus the 0x80–0x9F block,
 * whose code points are separate Unicode characters (— is U+2014 here but 0x97 in the font).
 * Spelled out from first principles rather than imported from doc.ts, so this checks `pdfSafe`
 * instead of agreeing with it.
 */
const WIN_ANSI = new Set([
  ...Array.from({ length: 0x100 - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ',
]);

const unprintable = (r: Rendered) =>
  r.drawn.flatMap((d) =>
    [...d.text]
      .filter((c) => !WIN_ANSI.has(c))
      .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()} "${c}" in: ${d.text.slice(0, 60)}`),
  );

describe("every symbol survives the font", () => {
  it("no document prints a character the standard fonts cannot encode", () => {
    // jsPDF does not fail on one — it re-encodes that single string as UTF-16BE and leaves the font
    // single-byte, so the symbol silently disappears from the page and nothing anywhere reports it.
    // Symbol runs pass this naturally: `θ` reaches the page as the ASCII byte `q`, and it is the
    // FONT that makes it Greek. That is the whole trick, and this is the check it has to survive.
    const docs = { fourbar, slider, warned, plain, portrait, overflowing, inches, sheet };
    for (const [name, r] of Object.entries(docs)) {
      expect(unprintable(r), `${name}: unrenderable characters reach the page`).toEqual([]);
    }
  });

  it("prints the real letters, not their names", () => {
    // The counterpart to the check above, which an empty document would also pass — and the
    // regression guard on the transliteration this replaced, where `ω₂` printed as `omega2`.
    expect(has(fourbar, "Input angle  θ₂")).toBe(true);
    expect(has(fourbar, "Output speed  ω₄")).toBe(true);
    expect(has(fourbar, "Coupler point angle  δ₃")).toBe(true);
    expect(valueOf(fourbar, "Transmission angle  μ")).toMatch(/^\d+\.\d{2}°$/);
    for (const spelt of ["theta", "omega", "delta", "  mu", "sqrt", "x-dot"]) {
      expect(has(fourbar, spelt), `"${spelt}" is spelled out somewhere`).toBe(false);
      expect(has(slider, spelt), `"${spelt}" is spelled out somewhere`).toBe(false);
    }
  });

  it("really is the Symbol font, and really is a shifted small digit", () => {
    // Everything above reads through `decode`, which could in principle agree with a broken
    // document. This does not: it asserts the raw bytes, the font they were drawn in, and the
    // geometry — which together are the only thing a viewer actually sees.
    const row = fourbar.rows.find((l) => span(l, 0, VALUE_X) === "Input angle  θ₂");
    expect(row, "no input-angle row").toBeDefined();

    const greek = row!.cells.filter((c) => c.run.font === "symbol");
    expect(greek.map((c) => c.run.text), "θ is not set in Symbol").toEqual(["q"]);

    const sub = row!.cells.find((c) => c.text === "₂");
    expect(sub, "the subscript is missing").toBeDefined();
    expect(sub!.run.text, "the subscript is not a plain digit").toBe("2");
    expect(sub!.run.size, "the subscript is full size").toBeLessThan(row!.cells[0].run.size);
    expect(sub!.run.y, "the subscript sits on the body baseline").toBeGreaterThan(row!.y);
    expect(sub!.x, "the subscript is not after the θ").toBeGreaterThan(greek[0].x);
  });
});

// ── the displayed equations ──────────────────────────────────────────────────────────
//
// "equation should be put in centre, and formated the way real equation use to be written not basic
// compputired way". The Freudenstein block used to be one monospace line of ASCII at the left
// margin; these are the four properties that make it an equation instead.

describe("displayed equations are typeset, not printed as ASCII", () => {
  /** The Freudenstein line — the one displayed equation that is a single row. */
  const eq = () => {
    const row = fourbar.rows.find((l) => l.text.startsWith("K₁ cos θ₄"));
    expect(row, "no Freudenstein row").toBeDefined();
    return row!;
  };

  it("centres the equation in the text column", () => {
    const row = eq();
    const leftInset = row.x - 48;
    // `lastX` is the last run's LEFT edge, so this over-states the right inset by that run's width —
    // a few points at 11pt. Asserting they are within 20 of each other is therefore a real claim
    // about centring, while asserting equality would only be a claim about this glyph.
    const rightInset = fourbar.W - 48 - row.lastX;
    expect(leftInset, "the equation is flush with the margin, not centred").toBeGreaterThan(30);
    expect(rightInset).toBeGreaterThan(0);
    expect(Math.abs(leftInset - rightInset), "the equation is off-centre").toBeLessThan(20);
  });

  it("stacks K₁…K₃ as fractions, each with a rule between its levels", () => {
    // Three baselines, not one: the numerators cluster on their own row, the denominators on
    // another, and neither is the row the `where` runs sit on. That is what "stacked" means, and a
    // one-line `r₁/r₂` could not produce it.
    const num = fourbar.rows.find((l) => l.text === "r₁r₁r₁² + r₂² − r₃² + r₄²");
    const den = fourbar.rows.find((l) => l.text === "r₂r₄2 r₂ r₄");
    expect(num, "the numerators are not on a row of their own").toBeDefined();
    expect(den, "the denominators are not on a row of their own").toBeDefined();
    expect(den!.y).toBeGreaterThan(num!.y);

    const rules = fourbar.strokes.filter(
      (s) => s.page === num!.page && s.y1 === s.y2 && s.y1 > num!.y && s.y1 < den!.y,
    );
    expect(rules, "a fraction is missing its rule").toHaveLength(3);

    // Each rule has to actually divide something, and nothing may hang off the end of its own bar —
    // the two ways a stacked fraction goes wrong once the numerator is wider than the denominator.
    for (const s of rules) {
      const under = num!.cells.filter((c) => c.x >= s.x1 - 0.01 && c.x <= s.x2);
      expect(under.length, `the rule at x=${s.x1.toFixed(0)} divides nothing`).toBeGreaterThan(0);
    }
    for (const c of num!.cells) {
      expect(
        rules.some((s) => c.x >= s.x1 - 0.01 && c.x <= s.x2),
        `numerator glyph "${c.text}" at x=${c.x.toFixed(0)} sits outside every rule`,
      ).toBe(true);
    }
    // K₃'s bar carries the whole polynomial while K₁'s carries one `r₁`, so the widths must differ by
    // a lot. Asserting an absolute width here would only be asserting Times' metrics.
    const w = rules.map((s) => s.x2 - s.x1).sort((a, b) => a - b);
    expect(w[2], "the three fractions are all the same width").toBeGreaterThan(w[0] * 4);
  });

  it("draws √ as a tick and an overbar across the whole radicand", () => {
    const row = slider.rows.find((l) => l.text.includes("s = r₃² − g²"));
    expect(row, "no radical row — the √ line is missing").toBeDefined();

    // The tick is the only slanted stroke in either document: every rule and divider is horizontal.
    expect(slider.strokes.some((s) => s.y1 !== s.y2), "the radical has no tick").toBe(true);
    expect(fourbar.strokes.some((s) => s.y1 !== s.y2), "something else draws a slanted line").toBe(false);

    const bar = slider.strokes.filter(
      (s) => s.page === row!.page && s.y1 === s.y2 && s.y1 < row!.y && s.y1 > row!.y - 20,
    );
    expect(bar, "the radicand has no overbar").not.toHaveLength(0);
    // It must reach past where the radicand starts, or it is barring nothing.
    expect(Math.max(...bar.map((s) => s.x2 - s.x1))).toBeGreaterThan(20);
  });

  it("dots ẋ once and ẍ twice, above the letter", () => {
    // These are `circle()` calls, so no text assertion anywhere can see them — and without them
    // "Slider velocity ẋ" and "Slider position x" are the same row label.
    const vel = slider.rows.find((l) => span(l, 0, VALUE_X) === "Slider velocity  x");
    const acc = slider.rows.find((l) => span(l, 0, VALUE_X) === "Slider acceleration  x");
    expect(vel, "no slider-velocity row").toBeDefined();
    expect(acc, "no slider-acceleration row").toBeDefined();

    const over = (y: number) => slider.dots.filter((d) => d.y < y && d.y > y - 12);
    expect(over(vel!.y), "ẋ is not dotted once").toHaveLength(1);
    expect(over(acc!.y), "ẍ is not dotted twice").toHaveLength(2);
    expect(slider.dots).toHaveLength(3);
    expect(fourbar.dots, "the four-bar report has no dotted variable to draw").toHaveLength(0);
  });
});
