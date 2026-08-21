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
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-[600px]">

        <div className="mb-6 flex justify-center">
          <LogoMark size={48} />
        </div>

        {/* 28px plus a first name wraps to three lines on a 375px phone, which pushes the composer
            below the fold — the one thing this screen exists to put in front of you. */}
        <h1 className="mb-2 text-center text-title font-semibold tracking-tight text-fg sm:text-display">
          {greeting}{who} — let's analyze a mechanism
        </h1>

        <p className="mb-8 text-center text-body text-muted">
          A kinematics agent for planar mechanisms. Describe a linkage, ask an engineering
          question, or open one from the sidebar. Every number comes from the deterministic solver.
        </p>

        <Composer
          modelId={modelId}
          onModelChange={onModelChange}
          onSend={onSend}
          busy={busy}
          autoFocus
          size="large"
          placeholder="Describe a four-bar or slider-crank, or ask a question…"
        />

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => onSend(p)}
              // A pill radius only reads as a pill on one line, and these prompts take two at
              // 375px. 16px is indistinguishable from a pill at this height and survives the wrap.
              className="rounded-2xl px-3.5 py-2.5 text-meta text-muted ring-1 ring-line
                         transition-colors hover:text-accent hover:ring-accent/50
                         sm:rounded-full sm:py-1.5"
            >
              {p}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
