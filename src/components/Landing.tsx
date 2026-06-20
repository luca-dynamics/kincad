import { Composer } from "./chat/Composer";
import { LogoMark } from "./Logo";

const PROMPTS = [
  "Analyze a crank-rocker with ground 4, crank 1.2, coupler 3.5, rocker 3",
  "What is the Grashof condition?",
  "Switch to a slider-crank and set the rod to 5",
  "Explain transmission angle and why it matters",
];

export function Landing({
  name,
  modelId,
  onModelChange,
  onSend,
  busy,
}: {
  name?: string;
  modelId: string;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments?: import("../ai/types").Attachment[]) => void;
  busy: boolean;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const who = name ? `, ${name.split(" ")[0]}` : "";

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">

      {/* ── Ambient background glow ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% -5%, var(--accent-glow) 0%, transparent 65%)",
        }}
      />
      {/* Secondary soft glow bottom-left for depth */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at -5% 110%, var(--accent-glow) 0%, transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-[640px]">

        {/* ── Logo mark with glow ring ── */}
        <div className="mb-7 flex justify-center">
          <div className="relative flex items-center justify-center">
            {/* Glow bloom behind the logo */}
            <div
              className="absolute h-28 w-28 rounded-full blur-3xl"
              style={{ background: "var(--accent)", opacity: 0.12 }}
            />
            <div style={{ filter: "drop-shadow(0 0 10px var(--accent-glow))" }}>
              <LogoMark size={56} className="relative block" />
            </div>
          </div>
        </div>

        {/* ── Heading ── */}
        <h1 className="mb-3 text-center">
          {/* Greeting line — gradient */}
          <span
            className="block text-[1.95rem] font-semibold leading-tight tracking-[-0.03em]"
            style={{
              background: "linear-gradient(135deg, var(--fg) 25%, var(--accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {greeting}{who}
          </span>
          {/* Sub-line — muted, smaller */}
          <span className="mt-1 block text-[1.05rem] font-normal tracking-[-0.01em] text-muted">
            Let's analyze a mechanism
          </span>
        </h1>

        {/* ── Description ── */}
        <p className="mb-8 text-center text-[13px] leading-relaxed text-faint">
          A kinematics agent for planar mechanisms. Describe a linkage, ask an engineering
          question, or open one from the sidebar.{" "}
          <span className="text-muted">Every number comes from the deterministic solver.</span>
        </p>

        {/* ── Composer — with subtle outer glow ── */}
        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-px rounded-[14px] opacity-60"
            style={{
              boxShadow: "0 0 40px -8px var(--accent-glow), 0 0 0 1px var(--accent-glow)",
            }}
          />
          <Composer
            modelId={modelId}
            onModelChange={onModelChange}
            onSend={onSend}
            busy={busy}
            autoFocus
            size="large"
            placeholder="Describe a four-bar or slider-crank, or ask a question…"
          />
        </div>

        {/* ── Prompt chips ── */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => onSend(p)}
              className="glass-2 rounded-full px-3.5 py-1.5 text-[11.5px] text-muted
                         transition-all duration-150
                         hover:-translate-y-0.5 hover:text-fg hover:shadow-[0_4px_16px_-4px_var(--accent-glow)]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
