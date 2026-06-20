// Small UI primitives — collapsible sections, label/slider/number rows,
// segmented toggles. Styled after CADAM's parameter panel aesthetic.

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
      className={`grid h-8 w-8 place-items-center rounded-[8px] text-muted
                  transition-all duration-100
                  hover:bg-line hover:text-fg active:scale-95
                  ${active ? "bg-line text-fg" : ""}
                  ${className}`}
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
        className="group flex w-full items-center justify-between py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-faint transition-colors hover:text-muted"
      >
        <span className="flex items-center gap-2">
          {title}
          {count != null && (
            <span className="rounded-full bg-line px-1.5 py-0.5 text-[9px] font-normal text-faint">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {children}
        </div>
      )}
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
    <div className="grid grid-cols-[80px_1fr] items-center gap-3">
      <label
        className="overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-muted"
        title={label}
      >
        {label}
      </label>
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
          className="num h-6 w-[3.25rem] flex-shrink-0 rounded-[7px] bg-panel-2 px-2
                     text-left text-[11.5px] text-fg outline-none
                     ring-1 ring-line transition-shadow duration-100
                     focus:ring-accent/50 focus:shadow-[0_0_0_3px_var(--accent-glow)]"
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
        {unit && (
          <span className="w-5 flex-shrink-0 text-left text-[11px] text-faint">{unit}</span>
        )}
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
    <div className="flex gap-0.5 rounded-[10px] bg-elevated p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[8px] px-2 py-1 text-[11.5px] transition-all duration-120 ${
            value === o.value
              ? "bg-accent/15 font-medium text-accent shadow-[0_1px_4px_rgba(0,0,0,0.10)]"
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
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[11.5px] text-muted">{k}</span>
      <span className="num text-[11.5px]" style={{ color: accent ?? "var(--fg)" }}>
        {v}
      </span>
    </div>
  );
}
