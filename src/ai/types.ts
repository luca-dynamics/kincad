// Agent layer types.
//
// The agent is a general-purpose mechanical-engineering assistant that ALSO drives the
// workspace through a small set of tools. Hard rule (unchanged): any numerical kinematic
// result the agent states must originate from the deterministic engine via a tool call /
// the analysis report — never from the model's own guess.

import type {
  AnalysisReport,
  FourBarLinkage,
  SliderCrankLinkage,
} from "../engine";
import type { MechanismKind } from "../state";
import type { CadModel } from "../cad/types";
import type { LengthUnit } from "../units";

/** An uploaded file attachment — image, PDF, DOCX, or plain-text document. */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  /** Distinguishes rendering and transmission mode. */
  kind: "image" | "pdf" | "document";
  /** Base64 data URL — present for images and PDFs. */
  dataUrl?: string;
  /** Extracted plain text — present for DOCX, TXT, CSV, MD files. */
  text?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Image attachments sent with a user turn. */
  attachments?: Attachment[];
  /** Workspace actions the assistant proposed on this turn, for display ("⚙ set crank = 1.2"). */
  actions?: WorkspaceAction[];
  /** True while this assistant message is still streaming/pending. */
  pending?: boolean;
  /** What happened during this turn — model, duration, pre-turn state. Assistant turns only. */
  meta?: TurnMeta;
  /** Whether this turn's proposed changes were approved. Undefined when it proposed none. */
  approval?: ApprovalState;
}

/**
 * What became of one turn's proposed changes. The agent no longer edits the workspace on its
 * own — it proposes, and the engineer decides — so this is the permanent record of that
 * decision, kept on the message itself and persisted with the conversation.
 *
 * `undefined` means there was nothing to decide: the turn only answered a question, ran the
 * solver, or generated an image — or it predates the approval flow entirely.
 */
export type ApprovalState =
  /** Waiting on the user. At most one message is ever in this state. */
  | "pending"
  /** The user pressed Apply. */
  | "applied"
  /** The user pressed Discard — the workspace was never touched. */
  | "discarded"
  /** A later turn proposed changes instead, so this one lapsed un-applied. */
  | "superseded"
  /** Auto-apply was on, so it landed without review. Recorded, never silent. */
  | "auto";

/**
 * Observed facts about one assistant turn, recorded by App.send() so the activity trace can
 * report what actually happened rather than guessing. Every field is measured, not inferred.
 */
export interface TurnMeta {
  /** Label of the model that actually answered — post-fallback, so it can differ from the picker. */
  modelLabel: string;
  /** Label of the originally-selected model, set only when the quota auto-fallback fired. */
  fellBackFrom?: string;
  /** Real wall-clock duration of the turn, in milliseconds. */
  elapsedMs: number;
  /**
   * Linkage state as it stood *before* this turn's actions were applied. Actions carry only
   * the new values (`Partial<…>`), so this is what makes "1.20 → 1.80" possible.
   */
  before?: {
    kind: MechanismKind;
    fourbar: FourBarLinkage;
    slider: SliderCrankLinkage;
    /**
     * Input speed at the time of the turn, for the full-cycle figures the trace recomputes.
     * Optional only for backwards compatibility — conversations saved before this field existed
     * restore without it, and the trace falls back to `DEFAULT_OMEGA2`.
     */
    omega2?: number;
    /**
     * Length unit declared at the time of the turn, so a restored transcript labels its lengths
     * the way they were labelled when it was written. Optional for the same backwards-compatibility
     * reason as `omega2`, with `DEFAULT_UNIT` as the fallback.
     */
    unit?: LengthUnit;
  };
}

/** A structured change the agent applies to the workspace. App is the single executor. */
export type WorkspaceAction =
  | { type: "set_mechanism"; kind: MechanismKind; note?: string }
  | { type: "set_fourbar"; params: Partial<FourBarLinkage>; note?: string }
  | { type: "set_slidercrank"; params: Partial<SliderCrankLinkage>; note?: string }
  | { type: "run_analysis"; note?: string }
  | { type: "set_cad"; model: CadModel; note?: string }
  | { type: "generated_image"; dataUrl: string; prompt: string };

/** Everything the agent can read about the current deterministic state. */
export interface AgentContext {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
  /**
   * Input speed in rad/s — the basis of every velocity and acceleration figure in `report`, and
   * what the server must re-analyse at so the numbers the model quotes are the numbers on screen.
   */
  omega2: number;
  /**
   * The length unit the workspace declares its dimensions in — a label the model must quote rather
   * than invent, since the geometry it reads is unitless and the solver is scale-free.
   */
  unit: LengthUnit;
  report: AnalysisReport;
  /** Lightweight personalization passed to the model (name + prefs). */
  user?: { name?: string };
  /**
   * True when workspace changes are gated behind the user's approval, false under auto-apply.
   * The system prompt tells the model to speak in proposals ("that would give…"), which is
   * only *true* in the gated mode — so the mode has to reach the server.
   */
  approvalRequired?: boolean;
}

export interface AgentReply {
  text: string;
  actions?: WorkspaceAction[];
}

export interface AgentModel {
  readonly id: string;
  readonly label: string;
  /** True if the model can actually run right now (e.g. offline mock, or a key is present). */
  readonly available: boolean;
  respond(messages: ChatMessage[], ctx: AgentContext): Promise<AgentReply>;
}
