import { LineChart, MessageSquare, Monitor, SlidersHorizontal, Menu } from "lucide-react";

export type MobileTab = "chat" | "view" | "insight" | "params";

interface Props {
  tab: MobileTab;
  onTab: (t: MobileTab) => void;
  onMenu: () => void;
  /**
   * Tabs with nothing behind them yet. They stay in the bar — it is the only view of the app's
   * shape on a phone — but render visibly disabled rather than as silent no-ops. See TabEmpty for
   * the other half of this: once a session has started the tabs are live and land on a placeholder
   * instead, because by then switching to them is a real navigation.
   */
  unavailable?: readonly MobileTab[];
}

export function MobileNav({ tab, onTab, onMenu, unavailable = [] }: Props) {
  const off = (t: MobileTab) => unavailable.includes(t);
  return (
    // Padding-bottom carries the iOS home-indicator safe area; the inner row keeps full-height
    // touch targets so the icons never get squashed by that padding.
    //
    // z-[60] puts the bar above the conversation drawer (z-50) and its backdrop (z-40), so the tabs
    // stay visible and tappable while the drawer is open — one tap to switch, instead of a tap that
    // only dismisses followed by a second one. The drawer reserves this bar's height at its own
    // bottom edge (see Sidebar.tsx) so nothing of its own ends up underneath.
    <nav
      className="z-[60] flex-shrink-0 border-t border-line bg-panel"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* h-14 — 56px, so each of the five tabs clears the 44px touch guidance with room to spare. */}
      <div className="flex h-14 items-stretch">
        <NavBtn onClick={onMenu} label="Menu">
          <Menu className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "chat"} onClick={() => onTab("chat")} label="Chat">
          <MessageSquare className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "view"} disabled={off("view")} onClick={() => onTab("view")} label="Workspace">
          <Monitor className="h-5 w-5" />
        </NavBtn>
        {/* Same icon as the desktop plots toggle in TopBar — one affordance, two layouts. */}
        <NavBtn active={tab === "insight"} disabled={off("insight")} onClick={() => onTab("insight")} label="Insight">
          <LineChart className="h-5 w-5" />
        </NavBtn>
        <NavBtn active={tab === "params"} disabled={off("params")} onClick={() => onTab("params")} label="Params">
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
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // `opacity-40` is the same disabled weight `Button` uses in ui.tsx, so a dead tab reads as
      // dead by the app's existing convention. Pointer events are left on, unlike `Button`'s
      // `disabled:pointer-events-none`, purely so the title still explains why.
      title={disabled ? `${label}: nothing to show until a mechanism is on screen` : undefined}
      className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-micro transition-colors ${
        disabled ? "text-muted opacity-40" : active ? "text-accent" : "text-muted hover:text-fg"
      }`}
    >
      {/* Tint alone is a weak signal on a 10px label — the rule states which tab you are on. */}
      {active && !disabled && <span className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-accent" />}
      {children}
      <span>{label}</span>
    </button>
  );
}
