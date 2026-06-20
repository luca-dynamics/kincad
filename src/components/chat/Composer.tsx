import { useRef, useState } from "react";
import { ArrowUp, Paperclip, X, Mic, FileText } from "lucide-react";
import mammoth from "mammoth";
import { ModelSelect } from "./ModelSelect";
import { useSpeechRecognition } from "../../hooks/useSpeech";
import type { Attachment } from "../../ai/types";

const ACCEPT = [
  "image/*",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/markdown",
  ".md",
  ".docx",
].join(",");

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export function Composer({
  modelId,
  onModelChange,
  onSend,
  busy,
  autoFocus,
  placeholder = "Ask the engineering agent…",
  size = "compact",
}: {
  modelId: string;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments?: Attachment[]) => void;
  busy: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  size?: "compact" | "large";
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechRecognition(setText);
  const toggleMic = () => (speech.listening ? speech.stop() : speech.start(text));

  const send = () => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || busy) return;
    if (speech.listening) speech.stop();
    onSend(t, attachments.length ? attachments : undefined);
    setText("");
    setAttachments([]);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];

    for (const f of Array.from(files)) {
      if (f.size > MAX_BYTES) {
        alert(`"${f.name}" is too large (max 20 MB).`);
        continue;
      }

      // ── Image ──────────────────────────────────────────────────────────
      if (f.type.startsWith("image/")) {
        const dataUrl = await readAsDataURL(f);
        next.push({ id: crypto.randomUUID(), name: f.name, mime: f.type, kind: "image", dataUrl });
        continue;
      }

      // ── PDF ────────────────────────────────────────────────────────────
      if (f.type === "application/pdf") {
        const dataUrl = await readAsDataURL(f);
        next.push({ id: crypto.randomUUID(), name: f.name, mime: f.type, kind: "pdf", dataUrl });
        continue;
      }

      // ── DOCX ───────────────────────────────────────────────────────────
      if (
        f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        f.name.endsWith(".docx")
      ) {
        try {
          const arrayBuffer = await f.arrayBuffer();
          const { value } = await mammoth.extractRawText({ arrayBuffer });
          next.push({ id: crypto.randomUUID(), name: f.name, mime: f.type, kind: "document", text: value });
        } catch {
          alert(`Could not read "${f.name}" — make sure it's a valid .docx file.`);
        }
        continue;
      }

      // ── Plain text / CSV / Markdown ────────────────────────────────────
      if (f.type.startsWith("text/") || f.name.endsWith(".md") || f.name.endsWith(".csv")) {
        const text = await readAsText(f);
        next.push({ id: crypto.randomUUID(), name: f.name, mime: f.type || "text/plain", kind: "document", text });
        continue;
      }
    }

    setAttachments((a) => [...a, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const large = size === "large";
  return (
    <div className="rounded-xl border border-line bg-panel-2 shadow-sm focus-within:border-accent/50">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div key={a.id} className="group relative">
              {a.kind === "image" && a.dataUrl ? (
                <img src={a.dataUrl} alt={a.name} className="h-14 w-14 rounded-md object-cover ring-1 ring-line" />
              ) : (
                <div className="flex h-14 w-28 flex-col items-center justify-center gap-1 rounded-md bg-accent/10 px-2 ring-1 ring-line">
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="max-w-full truncate text-center text-[9px] text-muted">{a.name}</span>
                  <span className="text-[8px] uppercase tracking-wide text-faint">
                    {a.kind === "pdf" ? "PDF" : a.name.split(".").pop()?.toUpperCase() ?? "TXT"}
                  </span>
                </div>
              )}
              <button
                onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-bad text-white opacity-0 transition-opacity group-hover:opacity-100"
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={large ? 2 : 1}
        placeholder={placeholder}
        className={`w-full resize-none bg-transparent px-4 text-fg outline-none placeholder:text-faint ${large ? "pt-4 text-sm" : "pt-3 text-[13px]"}`}
      />

      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach image, PDF, DOCX, or text file"
            className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {speech.supported && (
            <button
              onClick={toggleMic}
              title={speech.listening ? "Stop dictation" : "Dictate (voice to text)"}
              className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
                speech.listening
                  ? "animate-pulse bg-accent/15 text-accent"
                  : "text-muted hover:bg-line hover:text-fg"
              }`}
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
          <ModelSelect modelId={modelId} onChange={onModelChange} />
        </div>
        <button
          onClick={send}
          disabled={busy || (!text.trim() && attachments.length === 0)}
          className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── File reading helpers ─────────────────────────────────────────────────────

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(file);
  });
}
