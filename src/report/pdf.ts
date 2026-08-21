// Generate an analysis report (PDF) from the deterministic engine report, optionally embedding a
// snapshot of the active view. All figures come from the engine.
//
// The A4 page machinery — page breaks, headings, the snapshot embed, the footer — lives in
// [doc.ts](doc.ts) and is shared with the CAD part sheet. This file is only the report's content.
//
// THREE RULES THIS FILE EXISTS TO KEEP, each earned by a defect found in a printed report:
//
//  1. STATE THE SPEED. Velocities and accelerations are meaningless without the ω₂ they were
//     computed at (ω₄ scales with ω₂, α₄ with ω₂²), so the full-cycle block is labelled with
//     `report.omega2` — the speed the sweep actually used, not one assumed here.
//  2. PRINT WHAT MAKES THE FIGURES REPRODUCIBLE. Every input the engine used is listed, including
//     the coupler-point geometry and the assembly circuit — the coupler-curve envelope cannot be
//     recomputed from r₁…r₄ alone, so printing only those made the figure unverifiable.
//  3. READ THE SAME AS THE SCREEN. Solved joint angles go through `degWrapped`, because the results
//     panel wraps them to [0, 360) and this sheet printed the raw `atan2` value: θ₃ was 32.01° on
//     screen and −327.99° on paper. The same angle, but nothing on the page says so, and a reader
//     checking the report against the app is entitled to conclude the numbers do not tally.
//
// (The third rule, "never let content fall off the page", is now `need()` in doc.ts.)

import type { AnalysisReport } from "../engine";
import { analyzeFourBar, analyzeSliderCrank, degWrapped, toDeg } from "../engine";
import { REPORT_STEPS } from "../insight";
import type { WorkspaceState } from "../state";
import { DEFAULT_UNIT, UNIT_NAME, len, perSec, perSec2, scaleFreeNote } from "../units";
import { createSheet } from "./doc";

/** ω₂ in the two units an engineer reads it in. */
function speedLabel(omega2: number): string {
  return `${omega2.toFixed(4)} rad/s  (${((omega2 * 60) / (2 * Math.PI)).toFixed(1)} rev/min)`;
}

export function exportReportPDF(
  report: AnalysisReport,
  canvasDataUrl?: string,
  state?: WorkspaceState,
) {
  const { gap, h2, kv, para, formula, divider, image, footer, save } = createSheet(
    "KINCAD — Kinematic Analysis Report",
  );

  // Every length on this sheet is stated in the workspace's declared unit ([units.ts](../units.ts)).
  // It is read off `state` rather than taken as its own argument because the unit belongs to the
  // workspace, not to this call — a caller free to pass a unit is a caller free to pass one that
  // disagrees with the dock. The fallback covers the report-only path (a saved report re-exported
  // with no live workspace), which is also where `DEFAULT_UNIT` is the only defensible guess.
  const unit = state?.unit ?? DEFAULT_UNIT;

  // The snapshot of whatever view the export was fired from — 2D drawing, 3D mechanism, or the
  // CAD part. Optional: `image()` skips one it cannot decode rather than failing the export.
  if (canvasDataUrl) image(canvasDataUrl);

  // ── mechanism section ────────────────────────────────────────────────────
  if (report.kind === "fourbar") {
    h2("Mechanism");
    kv("Type", "Four-bar linkage");
    kv("Grashof classification", report.grashof.type);
    kv("Input fully rotates", report.inputFullyRotates ? "Yes (crank)" : "No (rocker)");
    kv("Input arc reachable", `${report.reachableArcDeg.toFixed(1)}° of 360°`);
    gap();

    // Every input the sweep consumed. The coupler point and the circuit are here because the
    // coupler-curve envelope below is a function of them — without them it cannot be checked.
    // Every row below carries the unit symbol; the note spells it out, because "declared in in" is
    // what the symbol produces for inches.
    h2("Link dimensions", `declared in ${UNIT_NAME[unit]}`);
    kv("Ground  r₁", len(report.link.ground, unit));
    kv("Input crank  r₂", len(report.link.input, unit));
    kv("Coupler  r₃", len(report.link.coupler, unit));
    kv("Output rocker  r₄", len(report.link.output, unit));
    kv("Coupler point  p  (from A)", len(report.link.couplerPointDist, unit));
    kv("Coupler point angle  δ₃", `${toDeg(report.link.couplerPointAngle).toFixed(2)}°  from r₃`);
    kv("Assembly circuit", report.link.circuit);
    gap();

    // Instantaneous results at current θ₂
    if (state) {
      const st = analyzeFourBar(state.fourbar, state.theta2, state.omega2);
      if (st.valid) {
        h2("Instantaneous results (at current θ₂)");
        kv("Input angle  θ₂", `${degWrapped(state.theta2).toFixed(2)}°`);
        kv("Coupler angle  θ₃", `${degWrapped(st.theta3).toFixed(2)}°`);
        kv("Output angle  θ₄", `${degWrapped(st.theta4).toFixed(2)}°`);
        kv("Input speed  ω₂", speedLabel(state.omega2));
        kv("Coupler speed  ω₃", `${st.omega3.toFixed(4)} rad/s`);
        kv("Output speed  ω₄", `${st.omega4.toFixed(4)} rad/s`);
        kv("Transmission angle  μ", `${st.transmissionAngle.toFixed(2)}°`);
        kv("Mechanical advantage", isFinite(st.mechanicalAdvantage) ? st.mechanicalAdvantage.toFixed(4) : "∞");
        gap();
      }
    }

    h2("Full-cycle kinematic summary", `at ω₂ = ${speedLabel(report.omega2)}, α₂ = 0, ${REPORT_STEPS} steps`);
    kv("Transmission angle  μ (min / max)", `${report.transmission.min.value.toFixed(2)}°  @  θ₂=${report.transmission.min.atTheta2Deg.toFixed(0)}°    /    ${report.transmission.max.value.toFixed(2)}°  @  θ₂=${report.transmission.max.atTheta2Deg.toFixed(0)}°`);
    kv("Mean transmission angle", `${report.transmission.mean.toFixed(2)}°`);
    kv("Output ω₄ (min / max)", `${report.omega4.min.value.toFixed(4)}  @  θ₂=${report.omega4.min.atTheta2Deg.toFixed(0)}°    /    ${report.omega4.max.value.toFixed(4)} rad/s  @  θ₂=${report.omega4.max.atTheta2Deg.toFixed(0)}°`);
    kv("Output α₄ (min / max)", `${report.alpha4.min.value.toFixed(4)}  @  θ₂=${report.alpha4.min.atTheta2Deg.toFixed(0)}°    /    ${report.alpha4.max.value.toFixed(4)} rad/s²  @  θ₂=${report.alpha4.max.atTheta2Deg.toFixed(0)}°`);
    // The envelope is the coupler curve's bounding BOX, so it is stated as a size in the declared
    // unit. It used to print `units²`, which reads as an area — but `w × h` is not one, and an area
    // is not what the engine measured.
    kv("Coupler-curve envelope", `${report.couplerExtent.width.toFixed(3)} × ${len(report.couplerExtent.height, unit, 3)}  (bounding box)`);

  } else {
    // slider-crank
    h2("Mechanism");
    kv("Type", "Slider-crank");
    kv("Crank fully rotates", report.inputFullyRotates ? "Yes" : "No");
    gap();

    h2("Link dimensions", `declared in ${UNIT_NAME[unit]}`);
    kv("Crank  r₂", len(report.link.crank, unit));
    kv("Connecting rod  r₃", len(report.link.rod, unit));
    kv("Slider offset  e", len(report.link.offset, unit));
    gap();

    // Instantaneous results
    if (state) {
      const st = analyzeSliderCrank(state.slider, state.theta2, state.omega2);
      if (st.valid) {
        h2("Instantaneous results (at current θ₂)");
        kv("Input angle  θ₂", `${degWrapped(state.theta2).toFixed(2)}°`);
        kv("Rod angle  θ₃", `${degWrapped(st.theta3).toFixed(2)}°`);
        kv("Input speed  ω₂", speedLabel(state.omega2));
        kv("Slider position  x", len(st.sliderPos, unit, 6));
        kv("Slider velocity  ẋ", `${st.sliderVel.toFixed(6)} ${perSec(unit)}`);
        kv("Slider acceleration  ẍ", `${st.sliderAcc.toFixed(6)} ${perSec2(unit)}`);
        kv("Transmission angle  μ", `${st.transmissionAngle.toFixed(2)}°`);
        gap();
      }
    }

    h2("Full-cycle kinematic summary", `at ω₂ = ${speedLabel(report.omega2)}, α₂ = 0, ${REPORT_STEPS} steps`);
    kv("Slider stroke", len(report.stroke, unit));
    kv("Slider velocity (min / max)", `${report.sliderVel.min.value.toFixed(4)}  @  θ₂=${report.sliderVel.min.atTheta2Deg.toFixed(0)}°    /    ${report.sliderVel.max.value.toFixed(4)} ${perSec(unit)}  @  θ₂=${report.sliderVel.max.atTheta2Deg.toFixed(0)}°`);
    kv("Slider acceleration (min / max)", `${report.sliderAcc.min.value.toFixed(4)}  @  θ₂=${report.sliderAcc.min.atTheta2Deg.toFixed(0)}°    /    ${report.sliderAcc.max.value.toFixed(4)} ${perSec2(unit)}  @  θ₂=${report.sliderAcc.max.atTheta2Deg.toFixed(0)}°`);
    kv("Transmission angle (min / max)", `${report.transmission.min.value.toFixed(2)}°  /  ${report.transmission.max.value.toFixed(2)}°`);
  }

  divider();

  // ── equations used ───────────────────────────────────────────────────────
  // Per mechanism. This section used to print Freudenstein's equation for BOTH mechanisms, so a
  // slider-crank report documented a method it had not used and defined K₁…K₃ from an r₄ the
  // mechanism does not have.
  h2("Analytical method — equations used");
  if (report.kind === "fourbar") {
    para(
      "Position analysis: Vector-loop closure (Freudenstein, 1955). The mechanism is modelled " +
      "as a closed vector polygon. Decomposing into x- and y-components and eliminating the " +
      "unknown coupler angle θ₃ yields Freudenstein's equation:",
    );
    gap(2);
    formula("K₁ cos θ₄ − K₂ cos θ₂ + K₃ = cos(θ₂ − θ₄)");
    // Written as three stacked fractions rather than the one-line `(r₁²+r₂²−r₃²+r₄²)/(2r₂r₄)`:
    // that form needs its own bracket to be unambiguous, and a reader has to supply the precedence
    // themselves. A rule does it for them, which is the entire reason the notation exists.
    formula([
      "where    K₁ = ",
      { over: "r₁", under: "r₂" },
      " ,     K₂ = ",
      { over: "r₁", under: "r₄" },
      " ,     K₃ = ",
      { over: "r₁² + r₂² − r₃² + r₄²", under: "2 r₂ r₄" },
    ]);
    para(
      "The coupler point P is then located on the coupler from joint A at distance p and angle " +
      "δ₃ measured from r₃, giving the coupler curve and the envelope reported above.",
    );
  } else {
    para(
      "Position analysis: Closed-form vector-loop solution for the offset slider-crank. With the " +
      "crank pivot at the origin and the slider travelling parallel to +x along y = e, the rod " +
      "must span the vertical gap g, which fixes both the slider coordinate and the rod angle:",
    );
    gap(2);
    // The pad between the two columns is fixed rather than spaces: `formula` centres what it is
    // given, so a gap made of spaces would be measured in whichever font happened to precede it.
    formula(["g = e − r₂ sin θ₂", { pad: 38 }, "s = √(r₃² − g²)"]);
    formula(["x = r₂ cos θ₂ + s", { pad: 38 }, "θ₃ = atan2(g, s)"]);
    para(
      "The mechanism fails to assemble where |g| > r₃ — those crank angles are excluded from the " +
      "sweep rather than approximated, which is what the reachable-rotation check reports.",
    );
  }
  para(
    "Velocity analysis: Analytical differentiation of the loop equations with respect to time " +
    "(Norton Eq. 6.18). No numerical differentiation is used. " +
    "Acceleration: second differentiation (Norton Eq. 7.12). " +
    "All results are exact closed-form solutions; no iterative method (Newton-Raphson etc.) is applied. " +
    "The input is taken as steady (α₂ = 0), so the accelerations above are the kinematic terms alone.",
  );
  gap();
  // Belongs under this heading rather than beside the dimensions: the reason a unit can be declared
  // instead of converted is a property of the equations printed above, and stating it here is what
  // stops a reader inferring the solver was handed millimetres and worked in them.
  h2("Units and scale");
  para(scaleFreeNote(unit, report.kind === "fourbar" ? "r₁ : r₂ : r₃ : r₄" : "r₂ : r₃ : e"));

  divider();

  // ── design notes ─────────────────────────────────────────────────────────
  h2("Design notes");
  if (report.warnings.length) {
    for (const wmsg of report.warnings) para("• " + wmsg, [150, 90, 20]);
  } else {
    para("No design-rule violations detected for the analysed cycle.");
  }

  footer(
    "All numerical results computed by the KINCAD deterministic kinematics engine " +
    "(vector-loop / Freudenstein method). The AI assistant does not generate numbers.",
  );
  save(`kincad-report-${report.kind}`);
}
