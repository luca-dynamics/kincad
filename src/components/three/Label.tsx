// One text label in a three.js scene. Wraps the sprite from
// [label3d.ts](../../render/label3d.ts) in the React lifecycle: built when its text or colour
// changes, disposed when it unmounts, and rescaled whenever the canvas is resized so it stays the
// same size on screen however far the camera has been orbited out.

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type * as THREE from "three";
import { labelScale, makeLabel } from "../../render/label3d";

export interface LabelSpec {
  /** React key. Stable per label slot (`r2`, `x`), not per value, so a length edit reuses the slot. */
  key: string;
  text: string;
  color: string;
  at: [number, number, number];
}

export default function Label({
  text,
  color,
  halo,
  at,
}: {
  text: string;
  color: string;
  /** Outline colour: the canvas background, so glyphs stay readable against the solids. */
  halo: string;
  at: [number, number, number];
}) {
  const height = useThree((s) => s.size.height);
  const camera = useThree((s) => s.camera);

  // Rebaking the texture is the expensive half of a label, so it is keyed on what is painted into
  // it. The position is NOT in here: it changes every frame while the mechanism animates and is a
  // plain prop write on the existing sprite.
  const label = useMemo(() => makeLabel(text, color, halo), [text, color, halo]);
  useEffect(() => () => label.dispose(), [label]);

  const fov = (camera as THREE.PerspectiveCamera).fov ?? 45;
  const s = labelScale(label.pxHeight, fov, height);

  return <primitive object={label.sprite} position={at} scale={[s * label.aspect, s, 1]} />;
}
