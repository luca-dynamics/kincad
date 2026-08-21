import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Sparkles, Lock, KeyRound, X } from "lucide-react";
import { ALL_MODELS, OFFLINE, PROXY_AGENTS, refreshAvailability, serverHasProvider } from "../../ai/models";
import { getKey, hasKey, setKey } from "../../ai/keys";
import { Button, IconButton } from "../ui";
import { PROVIDER_LABEL, type Provider } from "../../../shared/models";

// Derived from PROVIDER_LABEL rather than hand-listed, so a provider added to shared/models.ts
// cannot end up with models in the registry but no section in this menu. Declaration order in
// PROVIDER_LABEL is therefore also the display order here.
const PROVIDERS = Object.keys(PROVIDER_LABEL) as Provider[];

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
  const [centred, setCentred] = useState(false); // fixed centred overlay on narrow screens
  const [, force] = useState(0);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const current = ALL_MODELS.find((m) => m.id === modelId) ?? OFFLINE;

  const close = () => { setOpen(false); setEditing(null); };

  const openMenu = () => {
    const narrow = window.innerWidth < 640;
    setCentred(narrow);
    if (!narrow) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        const margin = 16;
        const above = r.top - margin;
        const below = window.innerHeight - r.bottom - margin;
        const up = above >= below;
        setDropUp(up);
        setMenuMaxH(Math.min(440, Math.max(200, up ? above : below)));
      }
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
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

  const menuContent = (
    <ModelMenu
      modelId={modelId}
      editing={editing}
      draft={draft}
      setEditing={setEditing}
      setDraft={setDraft}
      onSave={saveKey}
      onClear={clearKey}
      onPick={(id) => { onChange(id); close(); }}
    />
  );

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={openMenu}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Hand-rolled rather than `Button`, because this sits in a row of IconButtons in the
        // composer and has to be exactly their height — 36px under a thumb, 32px under a mouse.
        // `min-w-0` + a truncating label: gateway model names carry a provider suffix, and without
        // this the longest of them widens the composer row instead of ellipsing.
        className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg px-2 text-meta text-muted transition-colors hover:bg-line hover:text-fg sm:h-8"
      >
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
        <span className="truncate">{current.label}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
      </button>

      {/* ── Mobile: fixed backdrop + centred card ── */}
      {open && centred && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose AI model"
            className="glass glass-modal max-h-[70dvh] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl p-2"
          >
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <span className="text-body font-semibold text-fg">Choose model</span>
              <IconButton title="Close" onClick={close}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            {menuContent}
          </div>
        </div>
      )}

      {/* ── Desktop: anchored dropdown ── */}
      {open && !centred && (
        <div
          style={{ maxHeight: menuMaxH }}
          className={`glass absolute left-0 z-30 w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-1.5 ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {menuContent}
        </div>
      )}
    </div>
  );
}

interface MenuProps {
  modelId: string;
  editing: Provider | null;
  draft: string;
  setEditing: (p: Provider | null) => void;
  setDraft: (s: string) => void;
  onSave: (p: Provider) => void;
  onClear: (p: Provider) => void;
  onPick: (id: string) => void;
}

function ModelMenu({ modelId, editing, draft, setEditing, setDraft, onSave, onClear, onPick }: MenuProps) {
  return (
    <>
      {PROVIDERS.map((p) => {
        const models = PROXY_AGENTS.filter((m) => m.provider === p);
        const byok = hasKey(p);
        const server = serverHasProvider(p);
        return (
          <div key={p} className="mb-1">
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-micro font-semibold uppercase tracking-wider text-faint">
                {PROVIDER_LABEL[p]}
              </span>
              {/* The two key affordances are 10px badges, but they are still buttons you tap on a
                  phone — so they carry a 32px box below `sm` and shrink to badge height above it. */}
              <span className="flex items-center gap-1">
                {server && <span className="text-micro text-good">server key</span>}
                {byok && (
                  <button
                    onClick={() => onClear(p)}
                    title="Remove your key"
                    className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-micro text-accent hover:bg-line hover:text-bad sm:h-6"
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
                    className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-micro text-muted hover:bg-line hover:text-accent sm:h-6"
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
                  onKeyDown={(e) => e.key === "Enter" && onSave(p)}
                  placeholder={`Paste ${PROVIDER_LABEL[p]} API key`}
                  // 16px under a thumb, or mobile Safari zooms the viewport the moment this is
                  // focused — and this field opens inside a centred modal, which the zoom breaks.
                  className="num h-8 min-w-0 flex-1 rounded-lg bg-panel-2 px-2 text-title text-fg outline-none ring-1 ring-line focus:ring-accent/60 focus-visible:outline-none sm:h-7 sm:text-meta"
                />
                <Button variant="primary" onClick={() => onSave(p)}>
                  Save
                </Button>
              </div>
            )}

            {models.map((m) => (
              <ModelRow
                key={m.id}
                label={m.label}
                selected={m.id === modelId}
                available={m.available}
                onClick={() => onPick(m.id)}
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
          onClick={() => onPick(OFFLINE.id)}
          hint="works with no key"
        />
      </div>
    </>
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
      // py-2.5 below `sm`: a single-line row lands at ~41px, so every model in the list is a
      // real tap target inside the centred picker.
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-body transition-colors hover:bg-line sm:py-1.5"
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${available ? "text-fg" : "text-faint"}`}>{label}</span>
        {hint && <span className="block text-micro text-faint">{hint}</span>}
        {!available && !hint && <span className="block text-micro text-faint">needs API key</span>}
      </span>
      {selected ? (
        <Check className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
      ) : !available ? (
        <Lock className="h-3 w-3 flex-shrink-0 text-faint" />
      ) : null}
    </button>
  );
}
