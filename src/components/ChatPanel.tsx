import { Sparkles, Plus, Zap, ZapOff, PanelLeftClose } from "lucide-react";
import { Thread } from "./chat/Thread";
import { Composer } from "./chat/Composer";
import { IconButton } from "./ui";
import type { Attachment, ChatMessage, TurnMeta, WorkspaceAction } from "../ai/types";

export function ChatPanel({
  messages,
  busy,
  streaming,
  modelId,
  onModelChange,
  onSend,
  onNewChat,
  current,
  onApply,
  onDiscard,
  autoApply,
  onToggleAutoApply,
  onCollapse,
  variant = "column",
}: {
  messages: ChatMessage[];
  busy: boolean;
  /** A reply is revealing incrementally. Locks the composer without showing the live loader. */
  streaming?: boolean;
  modelId: string;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onNewChat: () => void;
  /** Live linkage state, for diffing a pending proposal against what is on screen. */
  current?: TurnMeta["before"];
  onApply: (index: number, actions: WorkspaceAction[]) => void;
  onDiscard: (index: number) => void;
  autoApply: boolean;
  onToggleAutoApply: () => void;
  /**
   * Collapses this panel in the desktop panel group. Absent on mobile and in the `variant="full"`
   * layouts, where there is no group to collapse into. Re-opening is the workspace toolbar's
   * far-left toggle — that one is still on screen once this header isn't.
   */
  onCollapse?: () => void;
  /** "column" = narrow docked panel (workspace); "full" = centered wide chat (chat-only mode). */
  variant?: "column" | "full";
}) {
  const full = variant === "full";
  return (
    <div className={`flex h-full w-full flex-col bg-panel ${full ? "" : "border-r border-line"}`}>
      <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-line px-4">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-head font-semibold tracking-tight text-fg">
          KIN<span className="text-accent">CAD</span>
          <span className="font-normal text-muted"> Agent</span>
        </span>
        {/* Two distinct icons rather than one icon in two tints: which mode you are in decides
            whether the agent can move the workspace on its own, so it should be readable at a
            glance and not depend on noticing a background wash. */}
        <IconButton
          title={
            autoApply
              ? "Auto-apply is on: the agent's changes land immediately"
              : "Auto-apply is off: the agent proposes, you approve"
          }
          onClick={onToggleAutoApply}
          active={autoApply}
          className="ml-auto"
        >
          {autoApply ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
        </IconButton>
        <IconButton title="New chat" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
        </IconButton>
        {onCollapse && (
          // "Collapse", not "Hide": the toolbar's toggle is the one that says Hide/Show, and two
          // buttons carrying the same accessible name while doing different things is a trap for
          // anyone driving this by screen reader or by title.
          <IconButton title="Collapse chat panel" onClick={onCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${full ? "mx-auto w-full max-w-3xl" : ""}`}>
        <Thread
          messages={messages}
          busy={busy}
          modelId={modelId}
          current={current}
          onApply={onApply}
          onDiscard={onDiscard}
        />

        <div className="border-t border-line p-3">
          {/* The loader tracks real model work (`busy`); the composer is also held shut while a
              reply is still revealing (`streaming`), so a second turn can't race the first onto screen. */}
          <Composer modelId={modelId} onModelChange={onModelChange} onSend={onSend} busy={busy || !!streaming} />
          <p className="mt-2 px-1 text-center text-micro text-faint">
            Numbers come from the deterministic solver · the agent explains & drives the workspace
          </p>
        </div>
      </div>
    </div>
  );
}
