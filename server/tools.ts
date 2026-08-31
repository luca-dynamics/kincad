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
import { DEFAULT_UNIT, UNIT_NAME, perSec, perSec2, type LengthUnit } from "../src/units.ts";
import { generateImage } from "./imageGen.ts";

export type MechanismKind = "fourbar" | "slidercrank";

export interface WorkingState {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
  /**
   * Input speed in rad/s, forwarded from the client's workspace. The `analyze` tool sweeps at this
   * speed so the velocities and accelerations the model quotes are the ones the user is looking at
   * — the engine's own default is a unit-rate 1 rad/s, which would silently understate ω₄ by the
   * speed factor and α₄ by its square.
   */
  omega2: number;
  /**
   * The length unit the client's workspace DECLARES its dimensions in. A label, not a scale factor:
   * the geometry arrives unitless and the solver is scale-free, so nothing here converts anything —
   * it exists so the model quotes the user's unit instead of inventing one, and so a mechanism
   * declared in inches is not described in millimetres. See src/units.ts.
   */
  unit: LengthUnit;
}

// Mirrors the client's WorkspaceAction union so the UI can apply what the agent did.
export type WorkspaceAction =
  | { type: "set_mechanism"; kind: MechanismKind }
  | { type: "set_fourbar"; params: Partial<FourBarLinkage> }
  | { type: "set_slidercrank"; params: Partial<SliderCrankLinkage> }
  | { type: "run_analysis" }
  | { type: "set_cad"; model: CadModel }
  | { type: "generated_image"; dataUrl: string; prompt: string };

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
    // No unit named here on purpose: this list is static, and the workspace's unit is chosen at
    // runtime. Naming "mm" in a schema the model reads every turn would contradict the declaration
    // in the system prompt the moment the user switches to inches. Lengths cross this boundary as
    // bare numbers, exactly as the scale-free solver takes them.
    description:
      "Set one or more four-bar link dimensions, as plain numbers in the workspace's declared " +
      "length unit (stated in the system prompt). Only include the fields you want to change.",
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
      "(and sets them as the active four-bar if feasible). The result reports the assembly circuit " +
      "the solution lies on, and inputDatumOffsetDeg / outputDatumOffsetDeg — a 180° offset means " +
      "that link points opposite the assumed datum, so the prescribed correspondence occurs at the " +
      "angles listed in precisionPoints. Always quote precisionPoints, not the requested angles.",
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
    name: "generate_image",
    description:
      "Generate an image from a text prompt and display it inline in the chat. Call this when the user " +
      "asks to visualise a part, concept, diagram, or design — or explicitly requests an image. " +
      "Write a detailed, descriptive prompt. The image is rendered by a specialist model (Gemini Nano Banana " +
      "or DALL-E 3) and shown immediately to the user.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed description of the image. Include shape, material, style, perspective, and lighting. " +
            "Example: 'Technical engineering illustration of a four-bar linkage mechanism, " +
            "silver aluminium links on a white background, clean line-art style.'",
        },
      },
      required: ["prompt"],
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
        params: {
          type: "string",
          description:
            "OPTIONAL JSON string: array of named parameters the spec references by key, e.g. " +
            '[{"key":"width","label":"Width","value":40,"min":20,"max":80,"unit":"mm"}]. ' +
            "When provided, dimensions in the spec may be the param KEY (a string) instead of a number, so the user can edit them.",
        },
      },
      required: ["name", "spec"],
    },
  },
];

export interface ToolOutcome {
  result: unknown; // JSON returned to the model
  action?: WorkspaceAction; // change to surface to the UI
}

export interface ImageKeys {
  googleKey?: string;
  openAIKey?: string;
}

/** Execute one tool call against the working state (mutated in place). */
export async function executeTool(
  state: WorkingState,
  name: string,
  input: Record<string, unknown>,
  imageKeys?: ImageKeys,
): Promise<ToolOutcome> {
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
          ? buildFourBarReport(state.fourbar, 360, state.omega2)
          : buildSliderCrankReport(state.slider, 360, state.omega2);
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
        // A negative Freudenstein ratio flips a link's datum by 180 deg. Report the flip and the
        // correspondence the linkage actually realises, so the angles quoted to the user are the
        // ones the workspace will show rather than the ones that were asked for.
        const deg = (r: number) => +((r * 180) / Math.PI).toFixed(4);
        const wrap360 = (r: number) => deg(((r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
        return {
          result: {
            feasible: true,
            link: res.link,
            notes: res.notes,
            inputDatumOffsetDeg: deg(res.inputOffset),
            outputDatumOffsetDeg: deg(res.outputOffset),
            precisionPoints: t2.map((a, i) => ({
              theta2Deg: wrap360(a + res.inputOffset),
              theta4Deg: wrap360(t4[i] + res.outputOffset),
            })),
          },
          action: { type: "set_fourbar", params: res.link },
        };
      }
      return { result: { feasible: false, notes: res.notes } };
    }
    case "generate_image": {
      const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
      if (!prompt) return { result: { ok: false, error: "prompt is required" } };
      try {
        const dataUrl = await generateImage(prompt, imageKeys?.googleKey, imageKeys?.openAIKey);
        return {
          result: { ok: true },
          action: { type: "generated_image", dataUrl, prompt },
        };
      } catch (e) {
        return { result: { ok: false, error: (e as Error).message } };
      }
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
      let params: CadModel["params"];
      if (input.params != null) {
        try {
          const p = typeof input.params === "string" ? JSON.parse(input.params) : input.params;
          if (Array.isArray(p)) {
            params = p
              .filter((x) => x && typeof x.key === "string" && typeof x.value === "number")
              .map((x) => ({
                key: String(x.key),
                label: String(x.label ?? x.key),
                value: Number(x.value),
                ...(typeof x.min === "number" ? { min: x.min } : {}),
                ...(typeof x.max === "number" ? { max: x.max } : {}),
                ...(typeof x.step === "number" ? { step: x.step } : {}),
                ...(typeof x.unit === "string" ? { unit: x.unit } : {}),
              }));
          }
        } catch {
          /* ignore malformed params — the client auto-extracts sliders as a fallback */
        }
      }
      const model: CadModel = { name: String(input.name ?? "Part"), node: parsed as CadNode, ...(params?.length ? { params } : {}) };
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

## Formatting your replies
The chat renders GitHub-flavoured markdown and LaTeX (KaTeX). Use it — this section governs SHAPE only and never relaxes "GROUND EVERY NUMBER IN THE SOLVER" above.
- Open with one plain sentence that answers the question. Structure comes after it, not before.
- Put solver figures in a markdown list or table with a bold label: "- **Transmission angle**: 43.2°–136.8° (mean 90.0°)". Never bury a run of numbers inside sentences.
- Standalone equations go in display math, with the '$$' delimiters on their OWN lines. A one-line '$$…$$' is parsed as INLINE math instead, so it is neither centred nor scrollable when wide:
$$
M = 3(n - 1) - 2j_1 - j_2
$$
- Symbols inside a sentence take single dollars: $\\mu$, $\\theta_2$, $\\omega_4$.
- Use '##' headings only when a reply is long enough to need sections. Keep paragraphs to 2–3 sentences.
- Bold the quantity, not the whole sentence. Use a table when you are comparing two or more designs.
- No code fences unless the content really is code or JSON.
- NO EM-DASHES OR EN-DASHES IN PROSE. Never write "—" or "–" between words or clauses. Use a colon where a label introduces its value ("**Grashof type**: crank-rocker"), a comma or semicolon for an aside, or start a new sentence. This is the user's house style for the whole project, and the same rule was applied to its documentation and its dissertation chapters.
  The only permitted use is a NUMERIC RANGE, where the en-dash is the correct typography: "43.2°–136.8°", "40–140°". A hyphen stays a hyphen in compound words: "crank-rocker", "four-bar", "rule-of-thumb".

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

### Make it editable (IMPORTANT — do this for every part)
Expose the part's key dimensions as named parameters so the user can edit them with sliders.
- Pass a 'params' JSON string: an array of {"key","label","value","min","max","unit":"mm"}.
- In the spec, write the param KEY (a quoted string) wherever that dimension appears, instead of the number.
Same plate, now parametric:
  spec   = {"type":"difference","children":[{"type":"box","size":["width","thickness","depth"]},{"type":"cylinder","radius":"hole_r","height":20}]}
  params = [{"key":"width","label":"Width","value":40,"min":20,"max":80,"unit":"mm"},{"key":"thickness","label":"Thickness","value":10,"min":4,"max":24,"unit":"mm"},{"key":"depth","label":"Depth","value":40,"min":20,"max":80,"unit":"mm"},{"key":"hole_r","label":"Hole radius","value":3,"min":1.5,"max":8,"unit":"mm"}]
Reuse one key for dimensions that must stay equal (e.g. a square plate uses "width" for two sides). If you omit params, the workspace still derives sliders automatically, but named params read better.
After generating, briefly describe the part and its key dimensions, and note they can edit parameters on the right and export STL from the toolbar.

## Generating images
When the user asks for a visual, diagram, or image (e.g. "show me what a rack-and-pinion looks like", "draw a flange"), call the 'generate_image' tool with a detailed prompt. The image is rendered by Gemini Nano Banana or DALL-E 3 and displayed in the chat. Write a detailed, vivid prompt — include shape, materials, style, and perspective. After the image appears, briefly describe what was generated.`;

/**
 * When the workspace is gated, the model's changes are only ever *offers* — so the base prompt's
 * "DRIVE THE WORKSPACE" framing would have it announce edits that have not happened. Appended
 * only in that mode, so the prompt is never false in the other one.
 */
const APPROVAL_PROMPT = `## Changes need the user's approval
Tool calls that change the workspace (set_mechanism, set_fourbar, set_slidercrank, synthesize_function_generator, generate_cad) are shown to the user as a PROPOSAL they must Apply or Discard. They are NOT live until then.
- Phrase them as proposals: "setting r₃ = 4.5 would give…", not "I've set r₃ = 4.5".
- Still call 'analyze' — its figures are real engine output for the proposed geometry. Attribute them that way: "with these dimensions the transmission angle stays within 43–137°".
- Close with a short invitation to decide ("apply it and I'll re-check the full cycle").
- The state you read through the tools at the start of a turn IS the live workspace. If a change you made earlier is absent from it, the user discarded it — acknowledge that briefly and move on. Never assume a change took effect.`;

/**
 * Build the system prompt: the base, plus whichever situational sections apply.
 *
 * The approval section goes LAST, after personalisation — it constrains how every reply is
 * phrased, so it earns the most-recently-read position; personalisation is only tone.
 *
 * `unit` is optional and falls back to the workspace default, because a caller with no live
 * workspace (a prompt built for a bare conversation) has no unit to declare — but a wrong unit is
 * worse than a defaulted one, so the live path always passes it.
 */
export function buildSystemPrompt({
  user,
  approvalRequired,
  unit = DEFAULT_UNIT,
}: {
  user?: { name?: string };
  approvalRequired?: boolean;
  unit?: LengthUnit;
} = {}): string {
  const parts = [BASE_PROMPT, unitPrompt(unit)];
  if (user?.name) {
    parts.push(
      `## Personalisation\nThe user's name is ${user.name}. Greet them by their first name on your first reply in a conversation, then keep it natural. Pitch explanations at a mechanical-engineering undergraduate and keep a supportive, mentor-like tone.`,
    );
  }
  if (approvalRequired) parts.push(APPROVAL_PROMPT);
  return parts.join("\n\n");
}

/**
 * The unit declaration, built per turn because the user can change it mid-conversation.
 *
 * It states both halves deliberately: the unit to QUOTE, and the fact that the numbers crossing the
 * tool boundary carry no unit at all. Without the second half a model that reads "the unit is in"
 * has an obvious next move — convert to millimetres before calling `set_fourbar` — and that single
 * unrequested rescale would move the mechanism on screen while looking, in the transcript, correct.
 */
function unitPrompt(unit: LengthUnit): string {
  return `## Length unit
The user has declared this workspace's length unit as ${UNIT_NAME[unit]} (${unit}). Every link dimension, stroke and slider position carries that unit; linear velocities are ${perSec(unit)} and accelerations ${perSec2(unit)}. Angles are always degrees in conversation and radians in the tools, whatever the length unit is.
- QUOTE this unit, never a different one: "r₃ = 4.5 ${unit}". Do not convert to any other unit, and do not describe a length without its unit.
- Dimensions cross the tool boundary as PLAIN NUMBERS in this unit — pass 4.5, not 4.5 ${unit} and not a converted value. The solver is scale-free (every angle, the Grashof classification and the transmission angle depend only on the ratios of the lengths), so a conversion would change the mechanism the user is looking at while appearing to preserve it.
- If the user asks for a different unit, tell them the selector is above the dimensions in the Parameters panel, and that switching it relabels the numbers without rescaling the mechanism.
- The 3D CAD parts from 'generate_cad' are the exception: those are millimetres always, independently of this declaration.`;
}
