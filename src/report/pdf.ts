// Generate a one-page analysis report (PDF) from the deterministic engine report, optionally
// embedding a snapshot of the workspace canvas. Uses jsPDF. All figures come from the engine.

import { jsPDF } from "jspdf";
import type { AnalysisReport } from "../engine";

export function exportReportPDF(report: AnalysisReport, canvasDataUrl?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = M;

  const h1 = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 28, 38);
    doc.text(t, M, y);
    y += 8;
    doc.setDrawColor(45, 212, 191);
    doc.setLineWidth(1.5);
    doc.line(M, y, W - M, y);
    y += 18;
  };
  const h2 = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(45, 130, 160);
    doc.text(t.toUpperCase(), M, y);
    y += 14;
  };
  const kv = (k: string, v: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 100, 112);
    doc.text(k, M, y);
    doc.setTextColor(20, 28, 38);
    doc.text(v, M + 200, y);
    y += 15;
  };
  const para = (t: string, color: [number, number, number] = [70, 80, 92]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(t, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 12 + 4;
  };

  h1("KINCAD — Kinematic Analysis Report");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 130, 140);
  doc.text(
    "AI-Assisted CAD-Based System for Kinematic Analysis & Synthesis of Planar Mechanisms",
    M,
    y,
  );
  y += 22;

  if (canvasDataUrl) {
    try {
      const imgW = W - 2 * M;
      const imgH = imgW * 0.42;
      doc.addImage(canvasDataUrl, "PNG", M, y, imgW, imgH);
      y += imgH + 18;
    } catch {
      /* image optional */
    }
  }

  if (report.kind === "fourbar") {
    h2("Mechanism");
    kv("Type", "Four-bar linkage");
    kv("Grashof classification", report.grashof.type);
    kv("Input fully rotates", report.inputFullyRotates ? "Yes (crank)" : "No (rocker)");
    y += 6;

    h2("Link dimensions");
    kv("Ground  r1", report.link.ground.toFixed(3));
    kv("Input crank  r2", report.link.input.toFixed(3));
    kv("Coupler  r3", report.link.coupler.toFixed(3));
    kv("Output rocker  r4", report.link.output.toFixed(3));
    y += 6;

    h2("Kinematic results (per 1 rad/s input)");
    kv("Transmission angle (min / max)", `${report.transmission.min.value.toFixed(1)}° @ θ2=${report.transmission.min.atTheta2Deg.toFixed(0)}°  /  ${report.transmission.max.value.toFixed(1)}°`);
    kv("Mean transmission angle", `${report.transmission.mean.toFixed(1)}°`);
    kv("Output ω4 (min / max)", `${report.omega4.min.value.toFixed(3)} / ${report.omega4.max.value.toFixed(3)} rad/s`);
    kv("Output α4 (min / max)", `${report.alpha4.min.value.toFixed(3)} / ${report.alpha4.max.value.toFixed(3)} rad/s²`);
    kv("Coupler-curve envelope", `${report.couplerExtent.width.toFixed(2)} × ${report.couplerExtent.height.toFixed(2)}`);
  } else {
    h2("Mechanism");
    kv("Type", "Slider-crank");
    kv("Crank fully rotates", report.inputFullyRotates ? "Yes" : "No");
    y += 6;

    h2("Link dimensions");
    kv("Crank  r2", report.link.crank.toFixed(3));
    kv("Connecting rod  r3", report.link.rod.toFixed(3));
    kv("Offset  e", report.link.offset.toFixed(3));
    y += 6;

    h2("Kinematic results (per 1 rad/s input)");
    kv("Slider stroke", report.stroke.toFixed(3));
    kv("Slider velocity (min / max)", `${report.sliderVel.min.value.toFixed(3)} / ${report.sliderVel.max.value.toFixed(3)}`);
    kv("Slider acceleration (min / max)", `${report.sliderAcc.min.value.toFixed(3)} / ${report.sliderAcc.max.value.toFixed(3)}`);
    kv("Transmission angle (min / max)", `${report.transmission.min.value.toFixed(1)}° / ${report.transmission.max.value.toFixed(1)}°`);
  }

  y += 10;
  h2("Design notes");
  if (report.warnings.length) {
    for (const wmsg of report.warnings) para("• " + wmsg, [150, 90, 20]);
  } else {
    para("No design-rule violations detected for the analysed cycle.");
  }

  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(150, 158, 166);
  doc.text(
    "All numerical results computed by the deterministic kinematics solver (vector-loop method). AI assistance does not generate numbers.",
    M,
    y,
  );

  doc.save("macking-analysis-report.pdf");
}

/** Trigger a PNG download of a canvas. */
export function exportCanvasPNG(canvas: HTMLCanvasElement, name = "macking-mechanism.png") {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name;
  a.click();
}
