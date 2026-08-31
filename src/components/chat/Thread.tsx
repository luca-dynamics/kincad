import { useEffect, useRef, useState } from "react";
import { Volume2, Square, Download, FileText, FileDown, Copy, Check } from "lucide-react";
import type { ChatMessage, TurnMeta, WorkspaceAction } from "../../ai/types";
import { Markdown } from "./Markdown";
import { AgentActivity, ProposalCard, TurnTrace } from "./ActivityTrace";
import { getModel } from "../../ai/models";
import { useSpeechSynthesis } from "../../hooks/useSpeech";
import { useCopy } from "../../hooks/useCopy";
import { downloadMarkdown, downloadChatPDF } from "../../report/download";
import { Card } from "../ui";

export function Thread({
  messages,
  busy,
  modelId,
  current,
  onApply,
  onDiscard,
}: {
  messages: ChatMessage[];
  busy: boolean;
  modelId: string;
  /** Live linkage state, so a pending proposal diffs against what is actually on screen. */
  current?: TurnMeta["before"];
  onApply: (index: number, actions: WorkspaceAction[]) => void;
  onDiscard: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tts = useSpeechSynthesis();
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages, busy]);

  return (
    <div ref={ref} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => (
        <Bubble
          key={i}
          msg={m}
          id={String(i)}
          tts={tts}
          current={current}
          // The index is bound here, so a bubble never has to know its own position — and the
          // actions travel up with the click rather than being read back out of `messages`.
          onApply={() => onApply(i, m.actions ?? [])}
          onDiscard={() => onDiscard(i)}
        />
      ))}
      {busy && <AgentActivity modelLabel={getModel(modelId).label} />}
    </div>
  );
}

/**
 * The bubble action row's button treatment. `h-8` sm:`h-7`, not `px-1.5 py-0.5`: these were ~20px
 * tall, which is not a button anyone can hit with a thumb. 32px on a phone, 28px under a mouse.
 */
const ACTION = "flex h-8 items-center gap-1 rounded-lg px-2 text-mini transition-colors sm:h-7";
const ACTION_IDLE = `${ACTION} text-faint hover:bg-line hover:text-fg`;

/**
 * Copy to clipboard — on BOTH sides of the thread, which is the convention every chat UI has
 * settled on, and the reason a user bubble now has an action row at all.
 *
 * It copies the message SOURCE, not the rendering: the markdown is what pastes usefully into a
 * report or a lab notebook, and for the agent's replies it is also what `Export → Markdown` writes,
 * so the two actions can't disagree about what the reply says.
 */
function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      onClick={() => copy(text)}
      title="Copy to clipboard"
      className={copied ? `${ACTION} text-accent` : ACTION_IDLE}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Typewriter cursor shown at the tail of a reply while it is still revealing. Purely a "more is
 * coming" affordance for the incremental display in App.send(); it carries no state and reports
 * nothing about the model — the reply it trails is already complete. Falls still under
 * `prefers-reduced-motion` (where the reveal is skipped and this never mounts anyway).
 */
function StreamCaret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-accent align-text-bottom motion-reduce:animate-none"
    />
  );
}

function Bubble({
  msg,
  id,
  tts,
  current,
  onApply,
  onDiscard,
}: {
  msg: ChatMessage;
  id: string;
  tts: ReturnType<typeof useSpeechSynthesis>;
  current?: TurnMeta["before"];
  onApply: () => void;
  onDiscard: () => void;
}) {
  const isUser = msg.role === "user";
  const speaking = tts.speakingId === id;
  const [dlOpen, setDlOpen] = useState(false);
  const slug = `kincad-reply-${id}`;
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] ${isUser ? "" : "w-full"}`}>
        {msg.attachments && msg.attachments.length > 0 && (
          <div className={`mb-1.5 flex flex-wrap gap-1.5 ${isUser ? "justify-end" : ""}`}>
            {msg.attachments.map((a) =>
              (a.kind ?? "image") === "image" && a.dataUrl ? (
                <img key={a.id} src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-lg object-cover ring-1 ring-line" />
              ) : (
                <div key={a.id} className="flex h-10 items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 ring-1 ring-line">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                  <span className="max-w-[120px] truncate text-mini text-muted">{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}
        {(msg.content || msg.pending) &&
          (isUser ? (
            <div className="whitespace-pre-wrap rounded-xl bg-accent/12 px-3.5 py-2.5 text-body text-fg">
              {msg.content}
            </div>
          ) : (
            // The shared Card, so the reply surface matches the proposal card and the turn trace
            // stacked directly beneath it.
            <Card className="px-3.5 py-2.5">
              <Markdown>{msg.content}</Markdown>
              {msg.pending && <StreamCaret />}
            </Card>
          ))}
        {/* Action row. Both roles get Copy; the rest is the agent's, and a user bubble's row is
            right-aligned under its own right-aligned bubble. Withheld while a reply is still
            revealing — Copy/Export/Listen against a half-shown answer would hand back a fragment. */}
        {msg.content && !msg.pending && (
          <div className={`mt-1 flex items-center gap-1 ${isUser ? "justify-end" : ""}`}>
            <CopyButton text={msg.content} />
            {!isUser && tts.supported && (
              <button
                onClick={() => (speaking ? tts.cancel() : tts.speak(msg.content, id))}
                title={speaking ? "Stop" : "Read aloud"}
                className={speaking ? `${ACTION} text-accent` : ACTION_IDLE}
              >
                {speaking ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {speaking ? "Stop" : "Listen"}
              </button>
            )}
            {/* Download menu */}
            {!isUser && (
              <div className="relative">
                <button onClick={() => setDlOpen((o) => !o)} title="Download reply" className={ACTION_IDLE}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                {dlOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setDlOpen(false)} />
                    <div className="absolute left-0 top-8 z-50 w-40 overflow-hidden rounded-xl border border-line bg-panel-2 py-1 shadow-menu">
                      <button
                        onClick={() => { downloadMarkdown(msg.content, `${slug}.md`); setDlOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-mini text-muted hover:bg-line hover:text-fg"
                      >
                        <FileText className="h-3.5 w-3.5" /> Markdown (.md)
                      </button>
                      <button
                        onClick={() => { downloadChatPDF(msg.content, `${slug}.pdf`); setDlOpen(false); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-mini text-muted hover:bg-line hover:text-fg"
                      >
                        <FileDown className="h-3.5 w-3.5" /> PDF (.pdf)
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {/* Inline generated images — held back until the reply settles, like the trace below. */}
        {!msg.pending &&
          msg.actions?.filter((a) => a.type === "generated_image").map((a, i) =>
          a.type === "generated_image" ? (
            <div key={i} className="mt-2">
              <img
                src={a.dataUrl}
                alt={a.prompt}
                title={a.prompt}
                className="max-w-full rounded-xl ring-1 ring-line"
                style={{ maxHeight: 480 }}
              />
              <p className="mt-1 text-micro italic text-faint line-clamp-2">{a.prompt}</p>
            </div>
          ) : null,
        )}
        {/* An undecided proposal is interactive and diffed against live state; everything else
            is retrospective — chips collapsed, full step trace on expand. Both wait until the
            reply has finished revealing, so the Apply button doesn't appear under half a sentence. */}
        {!isUser && !msg.pending &&
          (msg.approval === "pending" ? (
            <ProposalCard
              actions={msg.actions ?? []}
              current={current}
              onApply={onApply}
              onDiscard={onDiscard}
            />
          ) : (
            <TurnTrace actions={msg.actions} meta={msg.meta} approval={msg.approval} />
          ))}
      </div>
    </div>
  );
}
