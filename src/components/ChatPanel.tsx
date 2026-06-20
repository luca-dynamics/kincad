import { Sparkles, Plus } from "lucide-react";
import { Thread } from "./chat/Thread";
import { Composer } from "./chat/Composer";
import { IconButton } from "./ui";
import type { Attachment, ChatMessage } from "../ai/types";

export function ChatPanel({
  messages,
  busy,
  modelId,
  onModelChange,
  onSend,
  onNewChat,
  variant = "column",
}: {
  messages: ChatMessage[];
  busy: boolean;
  modelId: string;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments?: Attachment[]) => void;
  onNewChat: () => void;
  /** "column" = narrow docked panel (workspace); "full" = centered wide chat (chat-only mode). */
  variant?: "column" | "full";
}) {
  const full = variant === "full";
  return (
    <div className={`flex h-full w-full flex-col bg-panel ${full ? "" : "border-r border-line"}`}>
      <div className="flex h-14 flex-shrink-0 items-center gap-2.5 border-b border-line px-4">
        <div className="relative flex items-center">
          <div
            className="absolute -inset-1 rounded-full"
            style={{ background: "var(--accent)", opacity: 0.15, filter: "blur(6px)" }}
          />
          <Sparkles className="relative h-4 w-4 text-accent" />
        </div>
        <span className="text-[13.5px] font-semibold tracking-[-0.02em] text-fg">
          KIN<span className="text-accent">CAD</span>{" "}
          <span className="font-normal text-muted">Agent</span>
        </span>
        <IconButton title="New chat" onClick={onNewChat} className="ml-auto">
          <Plus className="h-4 w-4" />
        </IconButton>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${full ? "mx-auto w-full max-w-3xl" : ""}`}>
        <Thread messages={messages} busy={busy} />

        <div className="border-t border-line p-3">
          <Composer modelId={modelId} onModelChange={onModelChange} onSend={onSend} busy={busy} />
          <p className="mt-2 px-1 text-center text-[10px] text-faint">
            Numbers come from the deterministic solver · the agent explains & drives the workspace
          </p>
        </div>
      </div>
    </div>
  );
}
