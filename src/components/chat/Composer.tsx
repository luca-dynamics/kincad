import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, X, Mic, FileText } from "lucide-react";
import mammoth from "mammoth";
import { ModelSelect } from "./ModelSelect";
import { useSpeechRecognition } from "../../hooks/useSpeech";
import { IconButton } from "../ui";
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechRecognition(setText);
  const toggleMic = () => (speech.listening ? speech.stop() : speech.start(text));

  // Grow the box to fit its content — typed, pasted, or dictated — up to a cap, then scroll.
  // Without this the textarea stays one row and long/pasted text is clipped to a single line.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto"; // reset first so the box can shrink as well as grow
    const max = size === "large" ? 240 : 160;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [text, size]);

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
          alert(`Could not read "${f.name}". Make sure it's a valid .docx file.`);
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
    <div className="rounded-xl border border-line bg-panel-2 shadow-raise focus-within:border-accent/50">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <div key={a.id} className="group relative">
              {a.kind === "image" && a.dataUrl ? (
                <img src={a.dataUrl} alt={a.name} className="h-16 w-16 rounded-lg object-cover ring-1 ring-line" />
              ) : (
                // h-16, not h-14: the name and kind labels are 11px and 10px now (they were 9px and
                // 8px — the smallest type in the app), and the old tile could not hold them.
                <div className="flex h-16 w-28 flex-col items-center justify-center gap-0.5 rounded-lg bg-accent/10 px-2 ring-1 ring-line">
                  <FileText className="h-5 w-5 text-accent" />
                  <span className="max-w-full truncate text-center text-mini text-muted">{a.name}</span>
                  <span className="text-micro uppercase tracking-wide text-faint">
                    {a.kind === "pdf" ? "PDF" : a.name.split(".").pop()?.toUpperCase() ?? "TXT"}
                  </span>
                </div>
              )}
              <button
                onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                // Always visible on a phone: hover-to-reveal would make removing an attachment
                // impossible there.
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-bad text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
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
        // 16px under a thumb: below that, mobile Safari zooms the whole viewport the moment the
        // composer is tapped, and the workspace behind it is thrown off screen.
        className={`w-full resize-none overflow-y-auto bg-transparent px-4 text-fg outline-none placeholder:text-faint ${
          large ? "pt-4 text-title sm:text-head" : "pt-3 text-title sm:text-body"
        }`}
      />

      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        <div className="flex min-w-0 items-center gap-1">
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <IconButton title="Attach image, PDF, DOCX, or text file" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </IconButton>
          {speech.supported && (
            <button
              onClick={toggleMic}
              title={speech.listening ? "Stop dictation" : "Dictate (voice to text)"}
              // Same box as IconButton, but the listening state is its own treatment rather than
              // IconButton's generic `active`.
              className={`grid h-9 w-9 place-items-center rounded-lg transition-all duration-100 active:scale-95 sm:h-8 sm:w-8 ${
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
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-accent text-accent-fg transition-all duration-100 hover:opacity-90 active:scale-95 disabled:opacity-30 sm:h-8 sm:w-8"
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
