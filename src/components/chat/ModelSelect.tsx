import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Sparkles, Lock, KeyRound, X } from "lucide-react";
import { ALL_MODELS, OFFLINE, PROXY_AGENTS, refreshAvailability, serverHasProvider } from "../../ai/models";
import { getKey, hasKey, setKey } from "../../ai/keys";
import { PROVIDER_LABEL, type Provider } from "../../../shared/models";

const PROVIDERS: Provider[] = ["anthropic", "openai", "google"];

export function ModelSelect({
  modelId,
  onChange,
}: {
  modelId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(true);
  const [menuMaxH, setMenuMaxH] = useState(420);
  const [, force] = useState(0);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = ALL_MODELS.find((m) => m.id === modelId) ?? OFFLINE;

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const margin = 16;
      const above = r.top - margin;
      const below = window.innerHeight - r.bottom - margin;
      const up = above >= below;
      setDropUp(up);
      // Cap height to the space actually available on that side, so the menu
      // never touches the viewport edge (it scrolls instead).
      setMenuMaxH(Math.min(440, Math.max(200, up ? above : below)));
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const saveKey = (p: Provider) => {
    setKey(p, draft);
    refreshAvailability();
    setEditing(null);
    setDraft("");
    force((n) => n + 1);
  };
  const clearKey = (p: Provider) => {
    setKey(p, null);
    refreshAvailability();
    force((n) => n + 1);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-line hover:text-fg"
      >
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        {current.label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          style={{ maxHeight: menuMaxH }}
          className={`glass absolute left-0 z-30 w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg p-1.5 ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {PROVIDERS.map((p) => {
            const models = PROXY_AGENTS.filter((m) => m.provider === p);
            const byok = hasKey(p);
            const server = serverHasProvider(p);
            return (
              <div key={p} className="mb-1">
                <div className="flex items-center justify-between px-2 pb-0.5 pt-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {PROVIDER_LABEL[p]}
                  </span>
                  <span className="flex items-center gap-1">
                    {server && <span className="text-[9px] text-good">server key</span>}
                    {byok && (
                      <button
                        onClick={() => clearKey(p)}
                        title="Remove your key"
                        className="flex items-center gap-0.5 text-[9px] text-accent hover:text-bad"
                      >
                        BYOK <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                    {!server && !byok && (
                      <button
                        onClick={() => {
                          setEditing(editing === p ? null : p);
                          setDraft(getKey(p) ?? "");
                        }}
                        className="flex items-center gap-0.5 text-[9px] text-muted hover:text-accent"
                      >
                        <KeyRound className="h-2.5 w-2.5" /> connect
                      </button>
                    )}
                  </span>
                </div>

                {editing === p && (
                  <div className="mb-1 flex items-center gap-1 px-2">
                    <input
                      type="password"
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveKey(p)}
                      placeholder={`Paste ${PROVIDER_LABEL[p]} API key`}
                      className="num h-6 flex-1 rounded bg-panel-2 px-2 text-[10px] text-fg outline-none ring-1 ring-line focus:ring-accent/60"
                    />
                    <button
                      onClick={() => saveKey(p)}
                      className="rounded bg-accent px-2 py-1 text-[10px] text-accent-fg"
                    >
                      Save
                    </button>
                  </div>
                )}

                {models.map((m) => (
                  <ModelRow
                    key={m.id}
                    label={m.label}
                    selected={m.id === modelId}
                    available={m.available}
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            );
          })}

          <div className="mt-1 border-t border-line pt-1">
            <ModelRow
              label={OFFLINE.label}
              selected={OFFLINE.id === modelId}
              available
              onClick={() => {
                onChange(OFFLINE.id);
                setOpen(false);
              }}
              hint="works with no key"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  label,
  selected,
  available,
  onClick,
  hint,
}: {
  label: string;
  selected: boolean;
  available: boolean;
  onClick: () => void;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-line"
    >
      <span className="flex-1">
        <span className={`block font-medium ${available ? "text-fg" : "text-faint"}`}>{label}</span>
        {hint && <span className="block text-[9px] text-faint">{hint}</span>}
        {!available && !hint && <span className="block text-[9px] text-faint">needs API key</span>}
      </span>
      {selected ? (
        <Check className="h-3.5 w-3.5 text-accent" />
      ) : !available ? (
        <Lock className="h-3 w-3 text-faint" />
      ) : null}
    </button>
  );
}
