import { PanelLeft, Sun, Moon, Code2, Plus, MessageSquare, Trash2, Spline, CircleDot, RotateCcw } from "lucide-react";
import { useTheme } from "../theme";
import { Logo, LogoMark } from "./Logo";
import { IconButton, iconBtnClass } from "./ui";
import type { MechanismKind } from "../state";
import { timeAgo, type Conversation } from "../store/conversations";

interface Props {
  open: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  currentId: string | null;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onQuickStart: (k: MechanismKind) => void;
  onReplayIntro: () => void;
  mobile?: boolean;
}

export function Sidebar({
  open,
  onToggle,
  conversations,
  currentId,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
  onQuickStart,
  onReplayIntro,
  mobile,
}: Props) {
  const { theme, toggle } = useTheme();

  const asideClass = mobile
    ? `fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-line bg-panel shadow-modal transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`
    : `flex h-full flex-col border-r border-line bg-panel transition-all duration-200 ${open ? "w-64" : "w-14"}`;

  return (
    <aside
      className={asideClass}
      // Bottom-nav clearance. The nav (h-14 + safe area, MobileNav.tsx) is painted ABOVE this drawer
      // so its tabs stay tappable while the drawer is open; reserving that height here keeps the
      // drawer's own footer — theme, replay intro, GitHub — from sitting underneath it, unreachable.
      // The panel background still runs to the viewport edge behind the nav, which is invisible: the
      // two share `bg-panel`.
      style={mobile ? { paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))" } : undefined}
    >

      {/* ── Brand header ── */}
      <div className="flex h-14 flex-shrink-0 items-center gap-2 px-3">
        {open ? (
          <>
            <Logo size={22} className="flex-1" />
            <IconButton title="Collapse sidebar" onClick={onToggle}>
              <PanelLeft className="h-4 w-4" />
            </IconButton>
          </>
        ) : (
          <div className="flex w-full flex-col items-center gap-1.5 pt-1">
            <LogoMark size={24} />
            <button
              title="Expand sidebar"
              onClick={onToggle}
              // Matches the `IconButton` in the expanded branch: 36px under a thumb, 28px under a
              // mouse, so the rail's one control isn't smaller than the thing it toggles into.
              className="grid h-9 w-9 place-items-center rounded-lg text-faint transition-colors hover:bg-line hover:text-fg sm:h-7 sm:w-7"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── New chat — premium CTA button ──
          Keeps its own accent-tinted treatment rather than using `Button`: it is the one
          persistent call to action in the app and is meant to read differently from chrome. */}
      <div className="px-2 pb-2">
        <button
          onClick={onNewChat}
          title="New chat"
          className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-body font-medium
                      transition-all duration-150
                      border border-accent/25 bg-accent/8 text-accent
                      hover:border-accent/50 hover:bg-accent/14 hover:shadow-[0_2px_16px_-4px_var(--accent-glow)]
                      ${open ? "" : "justify-center"}`}
        >
          <Plus className="h-4 w-4 flex-shrink-0 transition-transform duration-150 group-hover:rotate-90" />
          {open && "New chat"}
        </button>
      </div>

      {/* ── Quick-start ── */}
      {open && (
        <div className="flex gap-1.5 px-2 pb-2">
          <QuickStart label="Four-bar"    icon={<Spline    className="h-3.5 w-3.5" />} onClick={() => onQuickStart("fourbar")} />
          <QuickStart label="Slider-crank" icon={<CircleDot className="h-3.5 w-3.5" />} onClick={() => onQuickStart("slidercrank")} />
        </div>
      )}

      {/* ── Conversation history ── */}
      <nav className="flex-1 overflow-y-auto px-2">
        {open && conversations.length > 0 && (
          <div className="mb-1.5 px-2 text-micro font-semibold uppercase tracking-[0.08em] text-faint">
            Recent
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === currentId;
            return (
              <div
                key={c.id}
                className={`group relative flex items-center gap-2 rounded-lg transition-all duration-100
                  ${open ? "" : "justify-center"}
                  ${active
                    ? "bg-accent/10"
                    : "hover:bg-line"
                  }`}
              >
                {/* Left accent border for active item */}
                {active && open && (
                  <div className="absolute left-0 top-1 bottom-1 w-[2.5px] rounded-full bg-accent" />
                )}
                <button
                  onClick={() => onOpenConversation(c.id)}
                  title={c.title}
                  // `min-h-9` below `sm` rather than more padding: collapsed to the rail this row is
                  // just a 14px icon, which `py-2` alone leaves at 30px — under the tap-target floor.
                  // Expanded it is already taller than 36px, so the floor costs nothing there.
                  className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left sm:min-h-0 ${active && open ? "pl-[14px]" : ""}`}
                >
                  <MessageSquare
                    className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${
                      active ? "text-accent" : "text-faint group-hover:text-muted"
                    }`}
                  />
                  {open && (
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-meta ${
                          active ? "font-medium text-accent" : "text-fg"
                        }`}
                      >
                        {c.title}
                      </span>
                      <span className="block truncate text-micro text-faint">{timeAgo(c.updatedAt)}</span>
                    </span>
                  )}
                </button>
                {open && (
                  <button
                    onClick={() => onDeleteConversation(c.id)}
                    title="Delete"
                    // Hover-to-reveal is a pointer idiom: there is no hover on a phone, so below
                    // `sm` the button is simply always there — and thumb-sized while it is.
                    className="mr-1 grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-faint transition-all hover:bg-bad/10 hover:text-bad sm:h-7 sm:w-7 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {open && conversations.length === 0 && (
            <p className="px-2 py-4 text-mini leading-relaxed text-faint">
              No saved chats yet.{" "}
              <span className="text-muted">Start a conversation and it'll appear here.</span>
            </p>
          )}
        </div>
      </nav>

      {/* ── Footer ── */}
      <div
        className={`flex items-center gap-0.5 border-t border-line p-2 ${open ? "" : "flex-col"}`}
      >
        <IconButton title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggle}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
        <IconButton title="Replay intro" onClick={onReplayIntro}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <a
          href="https://github.com/luca-dynamics/kincad"
          target="_blank"
          rel="noreferrer"
          title="KINCAD on GitHub"
          // Borrows IconButton's class string rather than reimplementing the square: it sits
          // between two real IconButtons and any difference in size or radius shows.
          className={iconBtnClass}
        >
          <Code2 className="h-4 w-4" />
        </a>
        {open && (
          <span className="ml-auto pr-1 text-micro tracking-wide text-faint">
            FUT Minna · FYP
          </span>
        )}
      </div>
    </aside>
  );
}

function QuickStart({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg
                 border border-line px-2 py-2 text-mini text-faint
                 transition-all duration-100 hover:border-accent/30 hover:bg-accent/6 hover:text-accent"
    >
      {icon}
      {label}
    </button>
  );
}
