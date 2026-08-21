// KINCAD brand mark — a four-bar linkage rendered as a geometric icon. Theme-aware via CSS
// variables (brand blue links, panel-filled ground pivots), scales crisply at any size.

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* ground reference line */}
      <line x1="6" y1="25" x2="26" y2="25" stroke="var(--faint)" strokeWidth="1.4" strokeDasharray="2 2" opacity="0.7" />
      {/* coupler-curve accent */}
      <path d="M8 8 Q 17 1.5 25.5 9" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="1.6 2.2" opacity="0.5" />
      {/* linkage: crank → coupler → rocker */}
      <path d="M6 25 L11 9 L22 13 L26 25" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* moving joints */}
      <circle cx="11" cy="9" r="2.5" fill="var(--accent)" />
      <circle cx="22" cy="13" r="2.5" fill="var(--accent)" />
      {/* grounded pivots */}
      <circle cx="6" cy="25" r="2.3" fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.6" />
      <circle cx="26" cy="25" r="2.3" fill="var(--panel)" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  );
}

/** Mark + wordmark, for headers and the landing screen. */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      {/* `text-head`, not `size * 0.6`: the derived size put the wordmark at a fractional 13.2px —
          the last untokenised font size in the app, and off the scale every label beside it uses.
          14px is the dock-header step, which is what this sits in. */}
      <span className="text-head font-semibold tracking-tight text-fg">
        KIN<span className="text-accent">CAD</span>
      </span>
    </span>
  );
}
