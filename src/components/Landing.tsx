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

        <h1 className="mb-2 text-center text-[1.75rem] font-semibold tracking-tight text-fg">
          {greeting}{who} — let's analyze a mechanism
        </h1>

        <p className="mb-8 text-center text-[13px] leading-relaxed text-muted">
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
              className="rounded-full px-3 py-1.5 text-[12px] text-muted ring-1 ring-line
                         transition-colors hover:text-accent hover:ring-accent/50"
            >
              {p}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
