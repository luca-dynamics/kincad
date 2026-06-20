import { MessageSquare, Monitor, SlidersHorizontal, Menu } from "lucide-react";

export type MobileTab = "chat" | "view" | "params";

interface Props {
  tab: MobileTab;
  onTab: (t: MobileTab) => void;
  onMenu: () => void;
}

export function MobileNav({ tab, onTab, onMenu }: Props) {
  return (
    // Padding-bottom carries the iOS home-indicator safe area; the inner row keeps full-height
    // touch targets so the icons never get squashed by that padding.
    <nav
      className="z-30 flex-shrink-0 border-t border-line bg-panel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 items-stretch">
        <NavBtn onClick={onMenu} label="Menu">
          <Menu className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "chat"} onClick={() => onTab("chat")} label="Chat">
          <MessageSquare className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "view"} onClick={() => onTab("view")} label="Workspace">
          <Monitor className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "params"} onClick={() => onTab("params")} label="Params">
          <SlidersHorizontal className="h-5 w-5" />
        </NavBtn>
      </div>
    </nav>
  );
}

function NavBtn({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors ${
        active ? "text-accent" : "text-muted hover:text-fg"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
