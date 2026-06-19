// Provider-neutral tool definitions + an executor grounded in the deterministic engine.
// Every provider adapter (Anthropic/OpenAI/Gemini) converts these JSON schemas into its own
// tool format, but they ALL run the same executor here — so no matter which model is chosen,
// the numbers come from the same solver. The model can never fabricate kinematic results.

import {
  buildFourBarReport,
  buildSliderCrankReport,
  synthesizeFunctionGenerator,
  toRad,
  type FourBarLinkage,
  type SliderCrankLinkage,
} from "../src/engine/index.ts";
import { validateCadNode, type CadModel, type CadNode } from "../src/cad/types.ts";

export type MechanismKind = "fourbar" | "slidercrank";

export interface WorkingState {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
}

// Mirrors the client's WorkspaceAction union so the UI can apply what the agent did.
export type WorkspaceAction =
  | { type: "set_mechanism"; kind: MechanismKind }
  | { type: "set_fourbar"; params: Partial<FourBarLinkage> }
  | { type: "set_slidercrank"; params: Partial<SliderCrankLinkage> }
  | { type: "run_analysis" }
  | { type: "set_cad"; model: CadModel };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export const TOOLS: ToolSpec[] = [
  {
    name: "set_mechanism",
    description: "Switch the active mechanism type shown in the workspace.",
    parameters: {
      type: "object",
      properties: { kind: { type: "string", enum: ["fourbar", "slidercrank"] } },
      required: ["kind"],
    },
  },
  {
    name: "set_fourbar",
    description:
      "Set one or more four-bar link dimensions. Units are arbitrary length units (treat as mm). " +
      "Only include the fields you want to change.",
    parameters: {
      type: "object",
      properties: {
        ground: { type: "number", description: "r1 ground link length" },
        input: { type: "number", description: "r2 input crank length" },
        coupler: { type: "number", description: "r3 coupler length" },
        output: { type: "number", description: "r4 output rocker length" },
        couplerPointDist: { type: "number", description: "distance of coupler point from joint A" },
        couplerPointAngleDeg: { type: "number", description: "coupler point angle (deg) from coupler line" },
        circuit: { type: "string", enum: ["open", "crossed"] },
      },
    },
  },
  {
    name: "set_slidercrank",
    description: "Set one or more slider-crank dimensions (crank r2, connecting rod r3, offset e).",
    parameters: {
      type: "object",
      properties: {
        crank: { type: "number" },
        rod: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "analyze",
    description:
      "Run a full-cycle kinematic analysis of the CURRENT mechanism and return the deterministic " +
      "report (Grashof type, transmission angle range, output velocity/acceleration extremes, stroke, " +
      "warnings). ALWAYS call this to obtain any numerical result before stating numbers.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "synthesize_function_generator",
    description:
      "Four-bar function-generation synthesis via Freudenstein's equation. Provide three input crank " +
      "angles and three desired output rocker angles (degrees). Returns the synthesised link lengths " +
      "(and sets them as the active four-bar if feasible).",
    parameters: {
      type: "object",
      properties: {
        theta2Deg: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        theta4Deg: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
        ground: { type: "number", description: "ground length to scale to (default 4)" },
      },
      required: ["theta2Deg", "theta4Deg"],
    },
  },
  {
    name: "generate_cad",
    description:
      "Generate a freeform 3D CAD part (NOT a four-bar/slider-crank) — a bracket, plate, flange, gear blank, " +
      "enclosure, etc. Provide a name and a `spec`: a JSON STRING describing a tree of solids and boolean " +
      "operations (see the system prompt for the schema). The part renders in the CAD view and is exportable to STL.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "short name for the part" },
        spec: { type: "string", description: "JSON string of the CadNode tree" },
      },
      required: ["name", "spec"],
    },
  },
];

export interface ToolOutcome {
  result: unknown; // JSON returned to the model
  action?: WorkspaceAction; // change to surface to the UI
}

/** Execute one tool call against the working state (mutated in place). */
export function executeTool(state: WorkingState, name: string, input: Record<string, unknown>): ToolOutcome {
  switch (name) {
    case "set_mechanism": {
      state.kind = input.kind as MechanismKind;
      return { result: { ok: true, kind: state.kind }, action: { type: "set_mechanism", kind: state.kind } };
    }
    case "set_fourbar": {
      const params: Partial<FourBarLinkage> = {};
      for (const k of ["ground", "input", "coupler", "output", "couplerPointDist"] as const) {
        if (typeof input[k] === "number") params[k] = input[k] as number;
      }
      if (typeof input.couplerPointAngleDeg === "number")
        params.couplerPointAngle = toRad(input.couplerPointAngleDeg as number);
      if (input.circuit === "open" || input.circuit === "crossed") params.circuit = input.circuit;
      state.fourbar = { ...state.fourbar, ...params };
      state.kind = "fourbar";
      return { result: { ok: true, fourbar: state.fourbar }, action: { type: "set_fourbar", params } };
    }
    case "set_slidercrank": {
      const params: Partial<SliderCrankLinkage> = {};
      for (const k of ["crank", "rod", "offset"] as const) {
        if (typeof input[k] === "number") params[k] = input[k] as number;
      }
      state.slider = { ...state.slider, ...params };
      state.kind = "slidercrank";
      return { result: { ok: true, slider: state.slider }, action: { type: "set_slidercrank", params } };
    }
    case "analyze": {
      const report =
        state.kind === "fourbar"
          ? buildFourBarReport(state.fourbar, 360)
          : buildSliderCrankReport(state.slider, 360);
      return { result: report, action: { type: "run_analysis" } };
    }
    case "synthesize_function_generator": {
      const t2 = (input.theta2Deg as number[]).map(toRad) as [number, number, number];
      const t4 = (input.theta4Deg as number[]).map(toRad) as [number, number, number];
      const ground = typeof input.ground === "number" ? (input.ground as number) : 4;
      const res = synthesizeFunctionGenerator({ theta2: t2, theta4: t4, ground });
      if (res.feasible && res.link) {
        state.fourbar = res.link;
        state.kind = "fourbar";
        return {
          result: { feasible: true, link: res.link, notes: res.notes },
          action: { type: "set_fourbar", params: res.link },
        };
      }
      return { result: { feasible: false, notes: res.notes } };
    }
    case "generate_cad": {
      let parsed: unknown;
      try {
        parsed = typeof input.spec === "string" ? JSON.parse(input.spec) : input.spec;
      } catch {
        return { result: { ok: false, error: "spec is not valid JSON" } };
      }
      if (!validateCadNode(parsed)) {
        return { result: { ok: false, error: "spec is not a valid CadNode tree (check node types/children)" } };
      }
      const model: CadModel = { name: String(input.name ?? "Part"), node: parsed as CadNode };
      return { result: { ok: true, name: model.name }, action: { type: "set_cad", model } };
    }
    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}

const BASE_PROMPT = `You are KINCAD, the kinematics + CAD agent inside a CAD-style workspace for PLANAR MECHANISMS (four-bar linkages and slider-crank mechanisms) and freeform 3D parts. The user is a mechanical engineering student working on a final-year project.

Your role:
- Help analyse and design four-bar and slider-crank mechanisms, generate 3D CAD parts, and answer mechanical-engineering questions clearly and rigorously.
- DRIVE THE WORKSPACE using the tools: set the mechanism type and link dimensions, run analysis, synthesise linkages, and generate CAD parts.
- GROUND EVERY NUMBER IN THE SOLVER. Never state a kinematic figure (angle, velocity, acceleration, transmission angle, stroke, Grashof type, etc.) from your own estimate — call the 'analyze' tool and quote its results. After any change to dimensions, call 'analyze' again before describing behaviour.
- Be concise and practical. Use engineering terminology, mention design rules of thumb (e.g. keep transmission angle 40–140°), and explain WHY.

When the user describes a mechanism, set it up with the tools, analyse it, then summarise the key results and any warnings. When they ask a conceptual question, answer directly (tools optional).

## Generating 3D CAD (freeform)
When the user asks for a 3D part that is NOT a four-bar/slider-crank mechanism (bracket, plate, flange, gear blank, enclosure, spacer, etc.), build it with the 'generate_cad' tool. Pass a 'name' and a 'spec' that is a JSON STRING for a tree of solids. Node types:
- {"type":"box","size":[x,y,z]}
- {"type":"cylinder","radius":r,"height":h,"segments":48}
- {"type":"cone","radius":r,"height":h}
- {"type":"sphere","radius":r}
- {"type":"torus","radius":R,"tube":t}
- {"type":"union","children":[...]}
- {"type":"difference","children":[A,B,...]}   // A minus the others — use for holes/cutouts
- {"type":"intersection","children":[...]}
Any node may add "transform":{"translate":[x,y,z],"rotate":[degX,degY,degZ],"scale":number|[x,y,z]} and "color":"#hex".
Cylinders/cones are oriented along the Y axis — rotate to reorient (e.g. a hole through a plate's thickness along Y needs no rotation). Units are millimetres; keep parts a few to a few hundred mm.
Example — a 40×40×10 plate with a 6 mm hole through its 10 mm thickness:
{"type":"difference","children":[{"type":"box","size":[40,10,40]},{"type":"cylinder","radius":3,"height":12}]}
After generating, briefly describe the part and its key dimensions, and note they can export STL from the toolbar.`;

/** Build the system prompt, optionally personalised with the user's name. */
export function buildSystemPrompt(user?: { name?: string }): string {
  if (user?.name) {
    return (
      BASE_PROMPT +
      `\n\n## Personalisation\nThe user's name is ${user.name}. Greet them by their first name on your first reply in a conversation, then keep it natural. Pitch explanations at a mechanical-engineering undergraduate and keep a supportive, mentor-like tone.`
    );
  }
  return BASE_PROMPT;
}
