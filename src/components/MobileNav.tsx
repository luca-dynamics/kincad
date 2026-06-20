import { MessageSquare, Monitor, SlidersHorizontal, Menu } from "lucide-react";

export type MobileTab = "chat" | "view" | "params";

interface Props {
  tab: MobileTab;
  onTab: (t: MobileTab) => void;
  onMenu: () => void;
}

export function MobileNav({ tab, onTab, onMenu }: Props) {
  return (
    <nav className="flex h-14 flex-shrink-0 items-stretch border-t border-line bg-panel">
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
