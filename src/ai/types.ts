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

/** An uploaded image attachment (e.g. a hand-sketch of a mechanism) for vision-capable models. */
export interface Attachment {
  id: string;
  name: string;
  mime: string; // e.g. image/png
  dataUrl: string; // base64 data URL
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Image attachments sent with a user turn. */
  attachments?: Attachment[];
  /** Workspace actions the assistant performed on this turn, for display ("⚙ set crank = 1.2"). */
  actions?: WorkspaceAction[];
  /** True while this assistant message is still streaming/pending. */
  pending?: boolean;
}

/** A structured change the agent applies to the workspace. App is the single executor. */
export type WorkspaceAction =
  | { type: "set_mechanism"; kind: MechanismKind; note?: string }
  | { type: "set_fourbar"; params: Partial<FourBarLinkage>; note?: string }
  | { type: "set_slidercrank"; params: Partial<SliderCrankLinkage>; note?: string }
  | { type: "run_analysis"; note?: string }
  | { type: "set_cad"; model: CadModel; note?: string };

/** Everything the agent can read about the current deterministic state. */
export interface AgentContext {
  kind: MechanismKind;
  fourbar: FourBarLinkage;
  slider: SliderCrankLinkage;
  report: AnalysisReport;
  /** Lightweight personalization passed to the model (name + prefs). */
  user?: { name?: string };
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
