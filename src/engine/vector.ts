import type { Vec2 } from "./types";

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** A point at distance r and angle th (rad) from the origin. */
export const polar = (r: number, th: number): Vec2 => ({
  x: r * Math.cos(th),
  y: r * Math.sin(th),
});

/** Point = base + r∠th. */
export const fromPolar = (base: Vec2, r: number, th: number): Vec2 =>
  add(base, polar(r, th));

export const toDeg = (rad: number): number => (rad * 180) / Math.PI;
export const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Wrap an angle to (-pi, pi]. */
export const wrapPi = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

/** Wrap an angle to [0, 2pi). */
export const wrap2Pi = (a: number): number => {
  const x = a % (2 * Math.PI);
  return x < 0 ? x + 2 * Math.PI : x;
};
