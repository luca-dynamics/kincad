// Small UI primitives styled after CADAM's parameter panel — collapsible sections,
// label/slider/number rows, segmented toggles. Kept dependency-light (no Radix).

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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
      className={`grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg ${
        active ? "bg-line text-fg" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

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
        className="group flex w-full items-center justify-between py-1 text-xs font-semibold text-fg"
      >
        <span className="flex items-center gap-2">
          {title}
          {count != null && <span className="text-[10px] font-normal text-faint">{count}</span>}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-2.5 flex flex-col gap-3">{children}</div>}
    </div>
  );
}

/** A CADAM-style numeric parameter row: [label | slider | numeric input | unit]. */
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
    <div className="grid grid-cols-[78px_1fr] items-center gap-3">
      <label className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted" title={label}>
        {label}
      </label>
      <div className="flex items-center gap-2.5">
        <input
          type="range"
          className="min-w-0 flex-1"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          className="num h-6 w-14 flex-shrink-0 rounded-md bg-panel-2 px-2 text-left text-xs text-fg outline-none ring-1 ring-line focus:ring-accent/60"
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
        {unit && <span className="w-5 flex-shrink-0 text-left text-xs text-faint">{unit}</span>}
      </div>
    </div>
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
    <div className="flex gap-0.5 rounded-lg bg-panel-2 p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
            value === o.value
              ? "bg-accent/15 font-medium text-accent"
              : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A key/value readout row for the results panel. */
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
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-xs text-muted">{k}</span>
      <span className="num text-xs" style={{ color: accent ?? "var(--fg)" }}>
        {v}
      </span>
    </div>
  );
}
