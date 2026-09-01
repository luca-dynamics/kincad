// Text labels for the three.js views: one canvas-textured sprite per label.
//
// WHY A SPRITE AND NOT drei's <Text>. Two reasons, and the second is the one that decides it.
// troika (what drei's <Text> is built on) fetches a font over the network for its default face, so
// the labels would arrive late or not at all offline. More importantly a sprite is REAL SCENE
// GEOMETRY: it lands in the WebGL colour buffer, so `captureViewPNG()` and the report/part-sheet
// snapshot include the labels. drei's <Html> would have been less code and is a DOM overlay — it
// looks identical on screen and is simply absent from every export, which is the one place a
// dimensioned figure earns its keep.
//
// WHY THE TEXT IS DRAWN ON A 2D CANVAS. It is the same `strokeText`-then-`fillText` halo that
// [draw.ts](draw.ts) paints for the 2D labels, in the same weight and font stack, so a link reads
// the same in the 2D and 3D views instead of drifting into two typographic styles.

import * as THREE from "three";

/** On-screen text height in CSS px. Matches the 2D canvas labels in [draw.ts](draw.ts). */
const FONT_PX = 12;
/** Halo room around the glyphs, in the same CSS px. */
const PAD_PX = 4;
/**
 * Texture supersample. The sprite is drawn at this multiple of its on-screen size and filtered back
 * down, which is what keeps it crisp on a HiDPI display — the texture is baked once at creation, so
 * it cannot be re-rendered per frame the way the 2D canvas labels are.
 */
const SS = 3;

const font = (px: number) => `600 ${px}px ui-sans-serif, system-ui, -apple-system, sans-serif`;

export interface Label3D {
  sprite: THREE.Sprite;
  /** Texture aspect (w / h). The caller scales x by this so the glyphs are not stretched. */
  aspect: number;
  /** Height the sprite should occupy on screen, in CSS px — feed it to `labelScale`. */
  pxHeight: number;
  /** Frees the texture and material. Sprites are not reference-counted; the owner must call this. */
  dispose(): void;
}

/**
 * Bake `text` into a sprite: `color` glyphs over a `halo`-coloured outline, sized in screen pixels
 * rather than world units and drawn over the solids.
 *
 * `depthTest: false` is deliberate. An annotation that says which bar is r₃ is useless when r₃ is
 * the bar currently behind the coupler, and a dimension on the far face of a part is exactly the one
 * a reader is looking for. So labels are always legible, and `renderOrder` puts them last.
 */
export function makeLabel(text: string, color: string, halo: string): Label3D {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  ctx.font = font(FONT_PX * SS);
  const w = ctx.measureText(text).width;
  canvas.width = Math.max(1, Math.ceil(w + 2 * PAD_PX * SS));
  canvas.height = Math.ceil((FONT_PX + 2 * PAD_PX) * SS);
  // Sizing a canvas resets its context AND every bit of state set on it, so the font goes on again
  // here rather than above — measuring first is what told us how wide to make it.
  ctx.font = font(FONT_PX * SS);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.5 * SS;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // No mipmaps: the texture is non-power-of-two and, being screen-sized, is never minified far
  // enough to need them — generating them costs memory and softens the glyphs.
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;

  const material = new THREE.SpriteMaterial({
    map,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 10;

  return {
    sprite,
    aspect: canvas.width / canvas.height,
    pxHeight: FONT_PX + 2 * PAD_PX,
    dispose: () => {
      map.dispose();
      material.dispose();
    },
  };
}

/**
 * The sprite scale that renders `pxHeight` CSS pixels tall at any camera distance.
 *
 * With `sizeAttenuation: false` three.js multiplies the sprite's scale by the view-space depth,
 * cancelling the perspective divide: a sprite of scale s then covers s / tan(fov / 2) of the NDC
 * height, which on a canvas h pixels tall is s·h / (2·tan(fov / 2)) pixels. This inverts that.
 *
 * Constant screen size, rather than a size in model units, is what lets one label style serve a
 * 4-unit linkage and a 600 mm plate — and it is how the 2D overlay already behaves.
 */
export function labelScale(pxHeight: number, fovDeg: number, canvasHeightPx: number): number {
  const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return (2 * pxHeight * t) / Math.max(canvasHeightPx, 1);
}
