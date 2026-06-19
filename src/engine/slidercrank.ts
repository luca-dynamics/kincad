// Deterministic slider-crank solver (in-line and offset).
// Frame: crank pivot O2 at the origin; the slider travels parallel to +x along the line
// y = offset. Crank tip A = (a cos t2, a sin t2). Slider pin B = (x, offset), connected to
// A by the rod of length b.
//
// Position is closed-form; velocity and acceleration come from analytically differentiating
// the slider coordinate x(theta2) and applying the chain rule with the input motion
// (omega2, alpha2). Validated against finite differences in the test suite.

import type { SliderCrankLinkage, SliderCrankState } from "./types";
import { toDeg, v } from "./vector";

/**
 * Solve slider position and rod angle for a crank angle. Returns null if the rod cannot
 * reach the slider line (|offset - a sin t2| > b), i.e. the mechanism cannot assemble.
 */
export function solveSliderPosition(
  link: SliderCrankLinkage,
  theta2: number,
): { x: number; theta3: number } | null {
  const a = link.crank;
  const b = link.rod;
  const e = link.offset;
  const g = e - a * Math.sin(theta2); // vertical gap the rod must span
  const root = b * b - g * g;
  if (root < 0) return null;
  const s = Math.sqrt(root); // horizontal rod projection (+ root = standard assembly)
  const x = a * Math.cos(theta2) + s;
  const theta3 = Math.atan2(g, s); // rod angle from +x
  return { x, theta3 };
}

export function analyzeSliderCrank(
  link: SliderCrankLinkage,
  theta2: number,
  omega2 = 1,
  alpha2 = 0,
): SliderCrankState {
  const a = link.crank;
  const b = link.rod;
  const e = link.offset;
  const O2 = v(0, 0);

  const pos = solveSliderPosition(link, theta2);
  if (!pos) {
    const A = v(a * Math.cos(theta2), a * Math.sin(theta2));
    return {
      theta2,
      theta3: NaN,
      omega2,
      omega3: NaN,
      alpha2,
      alpha3: NaN,
      sliderPos: NaN,
      sliderVel: NaN,
      sliderAcc: NaN,
      O2,
      A,
      B: A,
      transmissionAngle: NaN,
      valid: false,
    };
  }
  const { x, theta3 } = pos;

  const c2 = Math.cos(theta2);
  const s2 = Math.sin(theta2);
  const g = e - a * s2; //  g
  const gp = -a * c2; //  dg/dt2
  const gpp = a * s2; //  d2g/dt2^2
  const s = Math.sqrt(b * b - g * g); // = horizontal projection
  // x = a cos t2 + s,  s = sqrt(b^2 - g^2)
  const sp = (-g * gp) / s; // ds/dt2
  const spp = -(gp * gp + g * gpp) / s - (g * gp * (g * gp)) / (s * s * s); // d2s/dt2^2
  const xp = -a * s2 + sp; // dx/dt2
  const xpp = -a * c2 + spp; // d2x/dt2^2

  // Chain rule to time: v = x' * w2 ; acc = x'' * w2^2 + x' * alpha2
  const sliderVel = xp * omega2;
  const sliderAcc = xpp * omega2 * omega2 + xp * alpha2;

  // Rod angular velocity/acceleration: theta3 = atan2(g, s).
  // d(theta3)/dt2 = (s*g' - g*s') / (s^2 + g^2) = (s*g' - g*s') / b^2
  const b2 = b * b;
  const t3p = (s * gp - g * sp) / b2;
  // second derivative w.r.t t2 of atan2(g, s):
  const num = s * gpp - g * spp; // d/dt2 of (s g' - g s') = s g'' - g s''  (s'g'-g's' cancel)
  const t3pp = num / b2;
  const omega3 = t3p * omega2;
  const alpha3 = t3pp * omega2 * omega2 + t3p * alpha2;

  const A = v(a * c2, a * s2);
  const B = v(x, e);

  // Transmission angle for slider-crank = angle between rod and slider travel direction,
  // reported acute (ideal near 90°). Rod makes angle theta3 with +x; slider moves along x.
  let mu = Math.abs(toDeg(theta3));
  mu = mu % 180;
  if (mu > 90) mu = 180 - mu;
  // transmission angle is between rod and the normal to slider motion in some texts; we use
  // the angle between the rod and the line of slider travel's perpendicular -> 90 - rodAngle.
  const transmissionAngle = 90 - mu;

  return {
    theta2,
    theta3,
    omega2,
    omega3,
    alpha2,
    alpha3,
    sliderPos: x,
    sliderVel,
    sliderAcc,
    O2,
    A,
    B,
    transmissionAngle,
    valid: true,
  };
}

export function sweepSliderCrank(
  link: SliderCrankLinkage,
  steps = 360,
  omega2 = 1,
  alpha2 = 0,
): SliderCrankState[] {
  const states: SliderCrankState[] = [];
  for (let i = 0; i < steps; i++) {
    const theta2 = (2 * Math.PI * i) / steps;
    const st = analyzeSliderCrank(link, theta2, omega2, alpha2);
    if (st.valid) states.push(st);
  }
  return states;
}

/** True if the crank can fully rotate: rod must always reach the slider line. */
export function sliderInputFullyRotates(link: SliderCrankLinkage): boolean {
  // worst case gap = offset + crank (when sin t2 = -1) and offset - crank.
  const maxGap = Math.abs(link.offset) + link.crank;
  return link.rod >= maxGap;
}
