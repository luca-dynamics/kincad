import { useEffect, useRef, useState } from "react";
import { Cog, Volume2, Square, Download, FileText, FileDown } from "lucide-react";
import type { ChatMessage } from "../../ai/types";
import { Markdown } from "./Markdown";
import { useSpeechSynthesis } from "../../hooks/useSpeech";
import { downloadMarkdown, downloadChatPDF } from "../../report/download";

export function Thread({ messages, busy }: { messages: ChatMessage[]; busy: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const tts = useSpeechSynthesis();
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [messages, busy]);

  return (
    <div ref={ref} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => (
        <Bubble key={i} msg={m} id={String(i)} tts={tts} />
      ))}
      {busy && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-faint">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" />
        </div>
      )}
    </div>
  );
}

function Bubble({
  msg,
  id,
  tts,
}: {
  msg: ChatMessage;
  id: string;
  tts: ReturnType<typeof useSpeechSynthesis>;
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
                <img key={a.id} src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-md object-cover ring-1 ring-line" />
              ) : (
                <div key={a.id} className="flex h-10 items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 ring-1 ring-line">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                  <span className="max-w-[120px] truncate text-[10px] text-muted">{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}
        {msg.content && (
          <div
            className={`rounded-xl px-3.5 py-2.5 ${
              isUser
                ? "whitespace-pre-wrap text-[13px] leading-relaxed bg-accent/12 text-fg"
                : "bg-panel-2 ring-1 ring-line"
            }`}
          >
            {isUser ? msg.content : <Markdown>{msg.content}</Markdown>}
          </div>
        )}
        {!isUser && msg.content && (
          <div className="mt-1 flex items-center gap-1">
            {tts.supported && (
              <button
                onClick={() => (speaking ? tts.cancel() : tts.speak(msg.content, id))}
                title={speaking ? "Stop" : "Read aloud"}
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] transition-colors ${
                  speaking ? "text-accent" : "text-faint hover:text-fg"
                }`}
              >
                {speaking ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {speaking ? "Stop" : "Listen"}
              </button>
            )}
            {/* Download menu */}
            <div className="relative">
              <button
                onClick={() => setDlOpen((o) => !o)}
                title="Download reply"
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-faint transition-colors hover:text-fg"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
              {dlOpen && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setDlOpen(false)} />
                  <div className="absolute left-0 top-6 z-50 w-36 rounded-lg border border-line bg-panel-2 py-1 shadow-xl">
                    <button
                      onClick={() => { downloadMarkdown(msg.content, `${slug}.md`); setDlOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-muted hover:bg-line hover:text-fg"
                    >
                      <FileText className="h-3 w-3" /> Markdown (.md)
                    </button>
                    <button
                      onClick={() => { downloadChatPDF(msg.content, `${slug}.pdf`); setDlOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-muted hover:bg-line hover:text-fg"
                    >
                      <FileDown className="h-3 w-3" /> PDF (.pdf)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* Inline generated images */}
        {msg.actions?.filter((a) => a.type === "generated_image").map((a, i) =>
          a.type === "generated_image" ? (
            <div key={i} className="mt-2">
              <img
                src={a.dataUrl}
                alt={a.prompt}
                title={a.prompt}
                className="max-w-full rounded-xl ring-1 ring-line"
                style={{ maxHeight: 480 }}
              />
              <p className="mt-1 text-[10px] text-faint italic line-clamp-2">{a.prompt}</p>
            </div>
          ) : null,
        )}
        {/* Workspace action chips */}
        {msg.actions && msg.actions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.actions
              .filter((a) => a.type !== "run_analysis" && a.type !== "generated_image")
              .map((a, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 text-[10px] text-accent"
                >
                  <Cog className="h-3 w-3" />
                  {actionLabel(a)}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function actionLabel(a: import("../../ai/types").WorkspaceAction): string {
  switch (a.type) {
    case "set_mechanism":
      return `mechanism → ${a.kind === "fourbar" ? "four-bar" : "slider-crank"}`;
    case "set_fourbar":
    case "set_slidercrank":
      return Object.entries(a.params)
        .map(([k, v]) => `${k}=${typeof v === "number" ? v : v}`)
        .join("  ");
    case "run_analysis":
      return "ran analysis";
    case "set_cad":
      return `CAD · ${a.model.name}`;
    case "generated_image":
      return "image generated";
  }
}
