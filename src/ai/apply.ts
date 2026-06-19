// Pure executor for workspace actions. Used both by App (to mutate live state) and by the
// offline agent (to compute the post-edit report so its narration stays solver-grounded).

import type { FourBarLinkage, SliderCrankLinkage } from "../engine";
import type { MechanismKind } from "../state";
import type { WorkspaceAction } from "./types";

export interface Linkages {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
}

export function applyActions(base: Linkages, actions: WorkspaceAction[]): Linkages {
  let { kind, fourbar, slider } = base;
  for (const a of actions) {
    switch (a.type) {
      case "set_mechanism":
        kind = a.kind;
        break;
      case "set_fourbar":
        fourbar = { ...fourbar, ...a.params };
        break;
      case "set_slidercrank":
        slider = { ...slider, ...a.params };
        break;
      case "run_analysis":
        break; // analysis is always live; no-op on geometry
      case "set_cad":
        break; // CAD model lives outside the linkage state; applied in App
    }
  }
  return { kind, fourbar, slider };
}
