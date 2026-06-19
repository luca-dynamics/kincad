import { useRef, useState } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import { ModelSelect } from "./ModelSelect";
import type { Attachment } from "../../ai/types";

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

  const send = () => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || busy) return;
    onSend(t, attachments.length ? attachments : undefined);
    setText("");
    setAttachments([]);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(f);
      });
      next.push({ id: crypto.randomUUID(), name: f.name, mime: f.type, dataUrl });
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
              <img src={a.dataUrl} alt={a.name} className="h-14 w-14 rounded-md object-cover ring-1 ring-line" />
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
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach image (e.g. a sketch)"
            className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg"
          >
            <Paperclip className="h-4 w-4" />
          </button>
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
