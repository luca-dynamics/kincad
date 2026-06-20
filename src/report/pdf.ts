// Generate a one-page analysis report (PDF) from the deterministic engine report, optionally
// embedding a snapshot of the workspace canvas. Uses jsPDF. All figures come from the engine.

import { jsPDF } from "jspdf";
import type { AnalysisReport } from "../engine";
import { analyzeFourBar, analyzeSliderCrank, toDeg } from "../engine";
import type { WorkspaceState } from "../state";

export function exportReportPDF(
  report: AnalysisReport,
  canvasDataUrl?: string,
  state?: WorkspaceState,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = M;

  // ── typography helpers ──────────────────────────────────────────────────
  const h1 = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20, 28, 38);
    doc.text(t, M, y);
    y += 8;
    doc.setDrawColor(107, 70, 193); // purple accent
    doc.setLineWidth(1.5);
    doc.line(M, y, W - M, y);
    y += 18;
  };
  const h2 = (t: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(107, 70, 193); // purple
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
  const divider = () => {
    y += 4;
    doc.setDrawColor(220, 220, 228);
    doc.setLineWidth(0.5);
    doc.line(M, y, W - M, y);
    y += 10;
  };

  // ── header ──────────────────────────────────────────────────────────────
  h1("KINCAD — Kinematic Analysis Report");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(120, 130, 140);
  doc.text(
    "AI-Assisted CAD-Based System for Kinematic Analysis & Synthesis of Planar Mechanisms",
    M,
    y,
  );
  y += 12;

  // Date + attribution
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(140, 148, 158);
  doc.text(`Generated: ${dateStr}, ${timeStr}`, M, y);
  doc.text("FYP: Ibidun Quyum Babatunde · 2021/1/82451EM · FUT Minna, Dept. of Mechanical Engineering", M, y + 11);
  y += 26;

  // ── workspace canvas ────────────────────────────────────────────────────
  if (canvasDataUrl) {
    try {
      const imgW = W - 2 * M;
      const imgH = imgW * 0.42;
      doc.addImage(canvasDataUrl, "PNG", M, y, imgW, imgH);
      y += imgH + 14;
    } catch {
      /* image optional */
    }
  }

  // ── mechanism section ────────────────────────────────────────────────────
  if (report.kind === "fourbar") {
    h2("Mechanism");
    kv("Type", "Four-bar linkage");
    kv("Grashof classification", report.grashof.type);
    kv("Input fully rotates", report.inputFullyRotates ? "Yes (crank)" : "No (rocker)");
    y += 4;

    h2("Link dimensions");
    kv("Ground  r₁", `${report.link.ground.toFixed(4)} units`);
    kv("Input crank  r₂", `${report.link.input.toFixed(4)} units`);
    kv("Coupler  r₃", `${report.link.coupler.toFixed(4)} units`);
    kv("Output rocker  r₄", `${report.link.output.toFixed(4)} units`);
    y += 4;

    // Instantaneous results at current θ₂
    if (state) {
      const st = analyzeFourBar(state.fourbar, state.theta2, state.omega2);
      if (st.valid) {
        h2("Instantaneous results (at current θ₂)");
        kv("Input angle  θ₂", `${toDeg(state.theta2).toFixed(2)}°`);
        kv("Coupler angle  θ₃", `${toDeg(st.theta3).toFixed(2)}°`);
        kv("Output angle  θ₄", `${toDeg(st.theta4).toFixed(2)}°`);
        kv("Input speed  ω₂", `${state.omega2.toFixed(4)} rad/s`);
        kv("Coupler speed  ω₃", `${st.omega3.toFixed(4)} rad/s`);
        kv("Output speed  ω₄", `${st.omega4.toFixed(4)} rad/s`);
        kv("Transmission angle  μ", `${st.transmissionAngle.toFixed(2)}°`);
        kv("Mechanical advantage", isFinite(st.mechanicalAdvantage) ? st.mechanicalAdvantage.toFixed(4) : "∞");
        y += 4;
      }
    }

    h2("Full-cycle kinematic summary");
    kv("Transmission angle  μ (min / max)", `${report.transmission.min.value.toFixed(2)}°  @  θ₂=${report.transmission.min.atTheta2Deg.toFixed(0)}°    /    ${report.transmission.max.value.toFixed(2)}°  @  θ₂=${report.transmission.max.atTheta2Deg.toFixed(0)}°`);
    kv("Mean transmission angle", `${report.transmission.mean.toFixed(2)}°`);
    kv("Output ω₄ (min / max)", `${report.omega4.min.value.toFixed(4)}  /  ${report.omega4.max.value.toFixed(4)} rad/s`);
    kv("Output α₄ (min / max)", `${report.alpha4.min.value.toFixed(4)}  /  ${report.alpha4.max.value.toFixed(4)} rad/s²`);
    kv("Coupler-curve envelope", `${report.couplerExtent.width.toFixed(3)} × ${report.couplerExtent.height.toFixed(3)} units²`);

  } else {
    // slider-crank
    h2("Mechanism");
    kv("Type", "Slider-crank");
    kv("Crank fully rotates", report.inputFullyRotates ? "Yes" : "No");
    y += 4;

    h2("Link dimensions");
    kv("Crank  r₂", `${report.link.crank.toFixed(4)} units`);
    kv("Connecting rod  r₃", `${report.link.rod.toFixed(4)} units`);
    kv("Slider offset  e", `${report.link.offset.toFixed(4)} units`);
    y += 4;

    // Instantaneous results
    if (state) {
      const st = analyzeSliderCrank(state.slider, state.theta2, state.omega2);
      if (st.valid) {
        h2("Instantaneous results (at current θ₂)");
        kv("Input angle  θ₂", `${toDeg(state.theta2).toFixed(2)}°`);
        kv("Rod angle  θ₃", `${toDeg(st.theta3).toFixed(2)}°`);
        kv("Slider position  x", st.sliderPos.toFixed(6));
        kv("Slider velocity  ẋ", `${st.sliderVel.toFixed(6)} units/s`);
        kv("Slider acceleration  ẍ", `${st.sliderAcc.toFixed(6)} units/s²`);
        kv("Transmission angle  μ", `${st.transmissionAngle.toFixed(2)}°`);
        y += 4;
      }
    }

    h2("Full-cycle kinematic summary");
    kv("Slider stroke", `${report.stroke.toFixed(4)} units`);
    kv("Slider velocity (min / max)", `${report.sliderVel.min.value.toFixed(4)}  /  ${report.sliderVel.max.value.toFixed(4)} units/s`);
    kv("Slider acceleration (min / max)", `${report.sliderAcc.min.value.toFixed(4)}  /  ${report.sliderAcc.max.value.toFixed(4)} units/s²`);
    kv("Transmission angle (min / max)", `${report.transmission.min.value.toFixed(2)}°  /  ${report.transmission.max.value.toFixed(2)}°`);
  }

  divider();

  // ── equations used ───────────────────────────────────────────────────────
  h2("Analytical method — equations used");
  para(
    "Position analysis: Vector-loop closure (Freudenstein, 1955). The mechanism is modelled " +
    "as a closed vector polygon. Decomposing into x- and y-components and eliminating the " +
    "unknown coupler angle θ₃ yields Freudenstein's equation:",
  );
  y += 2;
  doc.setFont("courier", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(50, 60, 75);
  doc.text("K₁ cos(θ₄) − K₂ cos(θ₂) + K₃ = cos(θ₂ − θ₄)", M + 10, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("where  K₁ = r₁/r₂,  K₂ = r₁/r₄,  K₃ = (r₁²+r₂²−r₃²+r₄²)/(2r₂r₄).", M + 10, y);
  y += 16;
  para(
    "Velocity analysis: Analytical differentiation of the loop equations with respect to time " +
    "(Norton Eq. 6.18). No numerical differentiation is used. " +
    "Acceleration: second differentiation (Norton Eq. 7.12). " +
    "All results are exact closed-form solutions; no iterative method (Newton-Raphson etc.) is applied.",
  );

  divider();

  // ── design notes ─────────────────────────────────────────────────────────
  h2("Design notes");
  if (report.warnings.length) {
    for (const wmsg of report.warnings) para("• " + wmsg, [150, 90, 20]);
  } else {
    para("No design-rule violations detected for the analysed cycle.");
  }

  // ── footer ───────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(7.5);
  doc.setTextColor(175, 182, 190);
  doc.text(
    "All numerical results computed by the KINCAD deterministic kinematics engine " +
    "(vector-loop / Freudenstein method). The AI assistant does not generate numbers.",
    M,
    pageH - 24,
  );

  const fname = `kincad-report-${report.kind}-${dateStr.replace(/\s/g, "-")}.pdf`;
  doc.save(fname);
}

/** Trigger a PNG download of a canvas. */
export function exportCanvasPNG(canvas: HTMLCanvasElement, name = "kincad-mechanism.png") {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = name;
  a.click();
}
