// Small UI primitives — buttons, cards, collapsible sections, label/slider/number rows,
// segmented toggles. Styled after CADAM's parameter panel aesthetic.
//
// Every size here comes from the type scale in index.css (text-micro … text-display) and every
// radius from Tailwind's named steps: `rounded-lg` for controls, `rounded-xl` for cards,
// `rounded-2xl` for overlays. Nothing in this file — or in anything that consumes it — should
// carry an arbitrary `text-[Npx]` or `rounded-[Npx]`.
//
// TOUCH TARGETS. Sizes are mobile-first: the base class is the size a thumb needs and the `sm:`
// variant is the tighter size a mouse can hit. That is why you see `h-9 w-9 sm:h-8 sm:w-8` and
// not the reverse — this app has a five-tab mobile nav, so the phone layout is not an afterthought.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

/**
 * The icon-button treatment as a bare string, for the handful of places that need it on an
 * element `IconButton` can't render — Sidebar's external `<a>`. Exported so those stay in sync
 * instead of reimplementing the same square at a slightly different radius.
 */
export const iconBtnClass =
  "grid h-9 w-9 place-items-center rounded-lg text-muted transition-all duration-100 " +
  "hover:bg-line hover:text-fg active:scale-95 sm:h-8 sm:w-8";

export function IconButton({
  title,
  onClick,
  active,
  children,
  className = "",
}: {
  title?: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`${iconBtnClass} ${active ? "bg-line text-fg" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────────────

/**
 * `primary` fills with the accent, `ghost` is transparent until hovered, `outline` carries a
 * hairline. One component so the six hand-rolled copies that used to live in TopBar, Onboarding,
 * ModelSelect, ActivityTrace and Landing can't drift in radius, padding or weight.
 *
 * The three class strings are split out because `Popover variant="primary"` composes exactly the
 * same button out of them — a menu trigger cannot BE a `Button` (it needs `aria-expanded` and
 * `aria-haspopup`), so it shares the parts instead of restating them. Module-private, not exported:
 * a non-component export from this file costs it fast refresh, and every consumer is right here.
 */
const BTN_BASE =
  "inline-flex flex-shrink-0 items-center justify-center rounded-lg " +
  "transition-all duration-100 active:scale-95 " +
  "disabled:pointer-events-none disabled:opacity-40";

const BTN_VARIANT = {
  primary: "bg-accent text-accent-fg font-medium hover:opacity-90",
  ghost: "text-muted hover:bg-line hover:text-fg",
  outline: "border border-line text-muted hover:border-accent/50 hover:text-accent",
} as const;

/** `sm` is chrome-density; `md` is a standalone call to action. Both clear 32px on a phone. */
const BTN_SIZE = {
  sm: "h-8 gap-1.5 px-2.5 text-meta sm:h-7",
  md: "h-10 gap-2 px-4 text-body sm:h-9",
} as const;

export function Button({
  variant = "ghost",
  size = "sm",
  title,
  onClick,
  disabled,
  type = "button",
  className = "",
  children,
}: {
  variant?: keyof typeof BTN_VARIANT;
  size?: keyof typeof BTN_SIZE;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Popover and menu rows ────────────────────────────────────────────────────────────

/**
 * An anchored dropdown: `trigger` renders inside an `IconButton`-shaped button, `children` open
 * below it and close on the next outside `mousedown`. The listener pattern is the one
 * [ModelSelect](chat/ModelSelect.tsx) has used since it shipped; this is the general form of it,
 * for TopBar's overflow menu.
 *
 * The menu is PORTALED to `document.body` and positioned `fixed` from the trigger's rect, which is
 * not decoration. TopBar's row is `overflow-hidden` (TopBar.tsx:289) — deliberately, so the θ₂ block
 * absorbs width shortfall instead of the toolbar spilling — and it is only 56px tall. An
 * `absolute top-full` menu inside it was therefore clipped to its first 4px: the box laid out 177px
 * tall, everything past the header edge was cut, and hit-testing inside the menu's own coordinates
 * returned the 2D canvas. It read as a menu bleeding under the panel instead of opening over it. A
 * popover anchored inside a clipping ancestor cannot escape it — no z-index fixes a clip — so it
 * leaves the subtree entirely.
 *
 * Consequences of the portal, each handled below: the menu is no longer a DOM descendant of the
 * trigger, so the outside-click test has to check both nodes; and `fixed` coordinates go stale the
 * moment anything scrolls or resizes, so they are recomputed on both.
 *
 * `ModelSelect` is deliberately NOT rebuilt on this. It also decides whether to drop *up*, measures
 * its own max height against the viewport, and swaps to a fixed centred modal below a 640px
 * viewport — none of which a four-item toolbar menu wants, and none of which is worth the risk of
 * rewriting the model picker to share one `mousedown` listener.
 */
export function Popover({
  trigger,
  label,
  align = "right",
  variant = "icon",
  className = "",
  children,
}: {
  /** Rendered inside the trigger button — an icon, usually. */
  trigger: React.ReactNode;
  /** Tooltip and accessible name for the trigger. The menu has no visible heading. */
  label: string;
  align?: "left" | "right";
  /**
   * `icon` is the square overflow trigger. `primary` matches an accent `Button` and adds a chevron —
   * for the CAD view's export menu, which IS the toolbar's primary action and cannot look secondary.
   */
  variant?: "icon" | "primary";
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Viewport coordinates for the portaled menu. `null` until the trigger has been measured. */
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number } | null>(null);

  const MENU_W = 208; // w-52
  const GAP = 6; // mt-1.5 equivalent, now that margin can't do it
  const EDGE = 12; // keep clear of the viewport edge, matching max-w-[calc(100vw-1.5rem)]

  const place = useCallback(() => {
    const t = ref.current?.getBoundingClientRect();
    if (!t) return;
    const below = window.innerHeight - t.bottom - GAP - EDGE;
    const above = t.top - GAP - EDGE;
    // Drop up only when below genuinely cannot hold the menu and above has more room. The toolbar
    // sits at the top of the panel, so below is nearly always the right answer; this is the
    // short-window case, not the normal one.
    const up = below < 160 && above > below;
    const width = Math.min(MENU_W, window.innerWidth - 2 * EDGE);
    const left =
      align === "right"
        ? Math.max(EDGE, Math.min(t.right - width, window.innerWidth - width - EDGE))
        : Math.max(EDGE, Math.min(t.left, window.innerWidth - width - EDGE));
    setPos({ top: up ? Math.max(EDGE, t.top - GAP) : t.bottom + GAP, left, maxH: up ? above : below });
  }, [align]);

  // Measured before paint, so the menu never shows for a frame at the wrong place.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Bound to `open` so a closed popover isn't holding document-level listeners — TopBar renders
  // one of these per workspace and the toolbar remounts on every view-mode change.
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Node;
      // Both nodes: the menu is portaled, so `ref.current.contains` alone would treat every click
      // inside the menu as an outside click and close it before the row's own handler ran.
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // `capture` on scroll so a scroll in any container — the panels each scroll independently —
    // repositions the menu rather than leaving it stranded over unrelated content.
    const onScroll = () => place();
    document.addEventListener("mousedown", h);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  const primary = variant === "primary";

  return (
    <div className={`relative flex-shrink-0 ${className}`} ref={ref}>
      <button
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          primary
            ? `${BTN_BASE} ${BTN_VARIANT.primary} ${BTN_SIZE.sm} ${open ? "opacity-90" : ""}`
            : `${iconBtnClass} ${open ? "bg-line text-fg" : ""}`
        }
      >
        {trigger}
        {primary && (
          <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // One handler on the container rather than wrapping every item's `onClick`: picking
            // anything in here dismisses the menu, which is what a menu is expected to do.
            onClick={() => setOpen(false)}
            // z-50 is the app's overlay band (sidebar drawer, ModelSelect's mobile card). It stays
            // below the mobile bottom nav's z-[60] on purpose: the nav is the one thing that must
            // never be covered, and a toolbar menu is not worth trapping a thumb behind.
            style={{ top: pos.top, left: pos.left, width: MENU_W, maxHeight: pos.maxH }}
            className="glass fixed z-50 w-52 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl p-1.5"
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * One row inside a `Popover`. Geometry matches ModelSelect's model rows — `py-2.5` below `sm` puts
 * a single-line item at ~41px, so a control that moved into the menu is still a real tap target.
 * `active` reads the same as `IconButton`'s active state, so a toggle means the same thing whether
 * it is inline in the toolbar or one click deep.
 */
export function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-body
                  transition-colors hover:bg-line sm:py-1.5
                  ${active ? "font-medium text-accent" : "text-muted hover:text-fg"}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-accent" />}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────────────

/**
 * A bounded surface inside a panel: the proposal card, the expanded turn trace, the onboarding
 * feature tiles. `tone="accent"` is for something awaiting a decision — the only case where a
 * card earns a coloured edge.
 *
 * No shadow: cards sit *in* the layout, and index.css reserves elevation for things that float.
 */
export function Card({
  tone = "default",
  className = "",
  children,
}: {
  tone?: "default" | "accent";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-panel-2
                  ${tone === "accent" ? "border-accent/40" : "border-line"} ${className}`}
    >
      {children}
    </div>
  );
}

/** A card's title strip: an uppercase eyebrow on the left, anything else pushed right. */
export function CardHead({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "accent";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <span
        className={`text-micro font-semibold uppercase tracking-[0.07em]
                    ${tone === "accent" ? "text-accent" : "text-muted"}`}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

// ── Sections and parameter rows ──────────────────────────────────────────────────────

export function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        // 10px uppercase over `py-1.5` is a 26px row — too small to tap, and this is the control
        // that opens and closes a whole section. `min-h` rather than more padding so the desktop
        // rhythm between sections is untouched.
        className="group flex min-h-9 w-full items-center justify-between py-1.5 text-micro font-semibold uppercase tracking-[0.07em] text-faint transition-colors hover:text-muted sm:min-h-0"
      >
        <span className="flex items-center gap-2">
          {title}
          {count != null && (
            <span className="num rounded-full bg-line px-1.5 py-0.5 text-micro font-normal text-faint">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-3 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

/**
 * The label column every parameter row shares. Extracted because Panel.tsx's circuit toggle used
 * to hand-roll this grid at 78px and `text-xs` — 2px and half a point off the rows above it, which
 * is exactly the kind of drift a shared shell makes impossible.
 */
export function ParamShell({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <label
        className="overflow-hidden text-ellipsis whitespace-nowrap text-meta text-muted"
        title={title ?? label}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/** CADAM-style numeric parameter row: [label | slider | numeric input | unit] */
export function ParamRow({
  label,
  value,
  min,
  max,
  step = 0.05,
  unit = "",
  decimals = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const display = text ?? value.toFixed(decimals);
  return (
    <ParamShell label={label}>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          className="min-w-0 flex-1 cursor-pointer"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          // 16px on a phone: mobile Safari zooms the whole viewport when a focused input is
          // under that, which throws the dock layout away for a two-character edit.
          className="num h-7 w-[3.5rem] flex-shrink-0 rounded-lg bg-panel-2 px-2
                     text-left text-title text-fg outline-none
                     ring-1 ring-line transition-shadow duration-100
                     focus:ring-accent/50 focus:shadow-[0_0_0_3px_var(--accent-glow)]
                     focus-visible:outline-none sm:text-meta"
          value={display}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          onBlur={() => {
            const n = parseFloat(text ?? "");
            if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
            setText(null);
          }}
        />
        {unit && <span className="w-5 flex-shrink-0 text-left text-mini text-faint">{unit}</span>}
      </div>
    </ParamShell>
  );
}

export function SegToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-xl bg-elevated p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          // py-2.5 below `sm`: 12px over `py-1.5` is a 29px segment, and a segmented control is
          // all tap target — there is no larger parent to hit instead.
          className={`flex-1 rounded-lg px-2 py-2.5 text-meta transition-all duration-100 sm:py-1.5 ${
            value === o.value
              ? "bg-accent/15 font-medium text-accent shadow-raise"
              : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Key/value readout row for the results panel. */
export function ResultRow({
  k,
  v,
  accent,
}: {
  k: string;
  v: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="text-meta text-muted">{k}</span>
      <span className="num text-meta" style={{ color: accent ?? "var(--fg)" }}>
        {v}
      </span>
    </div>
  );
}
