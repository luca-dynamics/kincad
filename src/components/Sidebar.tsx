import { PanelLeft, Sun, Moon, Code2, Plus, MessageSquare, Trash2, Spline, CircleDot, RotateCcw } from "lucide-react";
import { useTheme } from "../theme";
import { Logo, LogoMark } from "./Logo";
import { IconButton } from "./ui";
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
  /** Mobile overlay mode: sidebar floats over content instead of pushing it. */
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

  // On mobile the sidebar is a fixed overlay drawer; on desktop it's an inline column.
  const asideClass = mobile
    ? `fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-line bg-panel shadow-xl transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`
    : `flex h-full flex-col border-r border-line bg-panel transition-all duration-200 ${open ? "w-64" : "w-14"}`;

  return (
    <aside className={asideClass}>
      {/* brand + collapse */}
      <div className="flex h-14 items-center gap-2 px-3">
        {open ? <Logo size={22} className="flex-1" /> : <LogoMark size={24} />}
        {open && (
          <IconButton title="Toggle sidebar" onClick={onToggle}>
            <PanelLeft className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {!open && (
        <div className="flex justify-center pb-2">
          <IconButton title="Expand sidebar" onClick={onToggle}>
            <PanelLeft className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {/* new chat */}
      <div className="px-2">
        <button
          onClick={onNewChat}
          title="New chat"
          className={`flex w-full items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13px] font-medium text-fg transition-colors hover:border-accent/50 hover:text-accent ${open ? "" : "justify-center"}`}
        >
          <Plus className="h-4 w-4" />
          {open && "New chat"}
        </button>
      </div>

      {/* quick start */}
      {open && (
        <div className="mt-2 flex gap-1.5 px-2">
          <QuickStart label="Four-bar" icon={<Spline className="h-3.5 w-3.5" />} onClick={() => onQuickStart("fourbar")} />
          <QuickStart label="Slider-crank" icon={<CircleDot className="h-3.5 w-3.5" />} onClick={() => onQuickStart("slidercrank")} />
        </div>
      )}

      {/* conversation history */}
      <nav className="mt-3 flex-1 overflow-y-auto px-2">
        {open && conversations.length > 0 && (
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">Recent</div>
        )}
        <div className="flex flex-col gap-0.5">
          {conversations.map((c) => {
            const active = c.id === currentId;
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors ${active ? "bg-accent/12" : "hover:bg-line"} ${open ? "" : "justify-center"}`}
              >
                <button
                  onClick={() => onOpenConversation(c.id)}
                  title={c.title}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <MessageSquare className={`h-3.5 w-3.5 flex-shrink-0 ${active ? "text-accent" : "text-faint"}`} />
                  {open && (
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] ${active ? "font-medium text-accent" : "text-fg"}`}>{c.title}</span>
                      <span className="block truncate text-[10px] text-faint">{timeAgo(c.updatedAt)}</span>
                    </span>
                  )}
                </button>
                {open && (
                  <button
                    onClick={() => onDeleteConversation(c.id)}
                    title="Delete"
                    className="flex-shrink-0 text-faint opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {open && conversations.length === 0 && (
            <p className="px-2 py-3 text-[11px] leading-relaxed text-faint">
              No saved chats yet. Start a conversation and it'll appear here.
            </p>
          )}
        </div>
      </nav>

      {/* footer */}
      <div className={`flex items-center gap-1 border-t border-line p-2 ${open ? "" : "flex-col"}`}>
        <IconButton title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggle}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
        <IconButton title="Replay intro" onClick={onReplayIntro}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <a
          href="https://github.com/Adam-CAD/CADAM"
          target="_blank"
          rel="noreferrer"
          title="CADAM (design reference)"
          className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg"
        >
          <Code2 className="h-4 w-4" />
        </a>
        {open && <span className="ml-auto pr-1 text-[10px] text-faint">FUT Minna · FYP</span>}
      </div>
    </aside>
  );
}

function QuickStart({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
    >
      {icon}
      {label}
    </button>
  );
}
