// Download helpers for exporting AI chat replies as Markdown or PDF.

import { jsPDF } from "jspdf";

/** Download a string as a .md file. */
export function downloadMarkdown(text: string, filename = "kincad-reply.md") {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, filename);
}

/** Download a plain text string as a .txt file. */
export function downloadText(text: string, filename = "kincad-reply.txt") {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, filename);
}

/**
 * Export a chat reply as a formatted PDF using jsPDF.
 * Does basic markdown → readable text conversion (headings, bullets, code blocks).
 */
export function downloadChatPDF(markdownText: string, filename = "kincad-reply.pdf") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 52; // margin
  const contentW = W - M * 2;
  let y = M;

  const newPage = () => {
    doc.addPage();
    y = M;
  };
  const checkY = (needed: number) => { if (y + needed > H - M) newPage(); };

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(107, 70, 193);
  doc.text("KINCAD", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 140);
  doc.text("Agent Reply Export", M + 66, y);
  y += 6;
  doc.setDrawColor(107, 70, 193);
  doc.setLineWidth(1.5);
  doc.line(M, y, W - M, y);
  y += 20;

  // ── Body — parse markdown lines ─────────────────────────────────────────
  const lines = markdownText.split("\n");
  let inCode = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Code fence toggle
    if (line.startsWith("```")) {
      inCode = !inCode;
      if (inCode) { checkY(14); y += 4; }
      else y += 4;
      continue;
    }

    if (inCode) {
      checkY(12);
      doc.setFont("courier", "normal");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 70);
      const wrapped = doc.splitTextToSize(line || " ", contentW - 16);
      doc.setFillColor(245, 244, 252);
      doc.rect(M, y - 9, contentW, wrapped.length * 12 + 2, "F");
      doc.text(wrapped, M + 6, y);
      y += wrapped.length * 12;
      continue;
    }

    // Blank line
    if (!line) { y += 6; continue; }

    // Headings
    if (line.startsWith("### ")) {
      checkY(22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 50);
      doc.text(stripInline(line.slice(4)), M, y);
      y += 16;
      continue;
    }
    if (line.startsWith("## ")) {
      checkY(26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(107, 70, 193);
      doc.text(stripInline(line.slice(3)), M, y);
      y += 20;
      continue;
    }
    if (line.startsWith("# ")) {
      checkY(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(20, 20, 40);
      doc.text(stripInline(line.slice(2)), M, y);
      y += 24;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      checkY(10);
      doc.setDrawColor(200, 200, 220);
      doc.setLineWidth(0.5);
      doc.line(M, y - 4, W - M, y - 4);
      y += 6;
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)/);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      const isNum = /\d+\./.test(bulletMatch[2]);
      const label = isNum ? bulletMatch[2] : "•";
      const text = stripInline(bulletMatch[3]);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 60);
      const x = M + indent * 16;
      const wrapped = doc.splitTextToSize(text, contentW - 24 - indent * 16);
      checkY(wrapped.length * 13 + 2);
      doc.text(label, x, y);
      doc.text(wrapped, x + 14, y);
      y += wrapped.length * 13;
      continue;
    }

    // Normal paragraph
    const text = stripInline(line);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 60);
    const wrapped = doc.splitTextToSize(text, contentW);
    checkY(wrapped.length * 13 + 2);
    doc.text(wrapped, M, y);
    y += wrapped.length * 13;
  }

  // ── Footer on every page ────────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 180);
    doc.text(`KINCAD · Page ${p} of ${total}`, W / 2, H - 24, { align: "center" });
  }

  doc.save(filename);
}

/** Strip inline markdown: **bold**, *italic*, `code`, [link](url) → plain text. */
function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
