// First-run onboarding — a compact centered modal box over a dimmed view of the app.
// Multi-step: one process per step, navigated with prev/next + dots.

import { useState } from "react";
import { MessageSquare, Gauge, Box, FileText, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { LogoMark } from "./Logo";
import { Button } from "./ui";
import { useTheme } from "../theme";

const FEATURES = [
  { icon: <MessageSquare className="h-4 w-4" />, title: "Talk to design", desc: "Describe a linkage; the agent builds & analyses it." },
  { icon: <Gauge className="h-4 w-4" />, title: "Deterministic solver", desc: "Exact θ, ω, α, Grashof & transmission angle." },
  { icon: <Box className="h-4 w-4" />, title: "2D & 3D workspace", desc: "Animate, drag joints, orbit in 3D." },
  { icon: <FileText className="h-4 w-4" />, title: "Synthesis & reports", desc: "Freudenstein synthesis, PDF / PNG export." },
];

export function Onboarding({ onComplete }: { onComplete: (name: string) => void }) {
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");
  const [step, setStep] = useState(0);
  const STEPS = 4;

  const finish = () => onComplete(name.trim());
  const next = () => (step >= STEPS - 1 ? finish() : setStep((s) => s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md">
      {/* `max-h` + scroll, not `overflow-hidden`: the feature grid is a single column on a phone,
          which is taller than any step on a laptop and would otherwise run off a short viewport. */}
      <div className="glass glass-modal max-h-full w-full max-w-lg overflow-y-auto rounded-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-2.5">
          <span className="flex items-center gap-2">
            <LogoMark size={22} />
            <span className="text-head font-semibold tracking-tight text-fg">
              KIN<span className="text-accent">CAD</span>
            </span>
          </span>
          <span className="text-micro font-medium text-faint">Step {step + 1} of {STEPS}</span>
        </div>

        {/* step content (fixed height so the box doesn't jump between steps) */}
        <div className="px-7 py-4">
          <div key={step} className="kc-step flex min-h-[168px] flex-col">
            {step === 0 && (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <LogoMark size={52} />
                <h1 className="mt-5 text-display font-semibold tracking-tight text-fg">Welcome to KINCAD</h1>
                <p className="mt-2 text-body text-muted">
                  An AI-assisted CAD workspace for <span className="text-fg">kinematic analysis and synthesis of planar
                  mechanisms</span> — four-bar and slider-crank. Describe a mechanism and the agent builds, animates and
                  analyses it, with every number from a deterministic solver.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-1 flex-col">
                <h2 className="text-head font-semibold tracking-tight text-fg">What you can do</h2>
                {/* One column on a phone: two 160px cards side by side truncate every title. */}
                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {FEATURES.map((f) => (
                    // `glass-2`, not the shared `Card`: inside a glass modal these tiles are meant
                    // to be translucent, and Card is deliberately opaque.
                    <div key={f.title} className="glass-2 rounded-xl p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-accent">
                        {f.icon}
                        <span className="text-meta font-medium text-fg">{f.title}</span>
                      </div>
                      <p className="text-mini text-muted">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-1 flex-col">
                <h2 className="text-head font-semibold tracking-tight text-fg">Make it yours</h2>
                <p className="mt-1 text-meta text-muted">A name to greet you by, and your theme.</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-mini font-medium text-muted">Set username for KINCAD</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && next()}
                      placeholder="Your name"
                      autoFocus
                      // 16px under a thumb — this input is autofocused, so a sub-16px size means
                      // mobile Safari zooms the modal the instant onboarding opens.
                      className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-title text-fg outline-none placeholder:text-faint focus:border-accent/60 sm:text-body"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-mini font-medium text-muted">Theme</label>
                    <div className="flex gap-1.5 rounded-lg bg-panel-2 p-1 ring-1 ring-line">
                      <ThemeBtn active={theme === "light"} onClick={() => setTheme("light")} icon={<Sun className="h-4 w-4" />} label="Light" />
                      <ThemeBtn active={theme === "dark"} onClick={() => setTheme("dark")} icon={<Moon className="h-4 w-4" />} label="Dark" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <LogoMark size={44} />
                <h2 className="mt-4 text-title font-semibold tracking-tight text-fg">
                  You're all set{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""}
                </h2>
                <p className="mt-2 text-body text-muted">
                  Describe a mechanism, ask an engineering question, or open one from the sidebar to begin.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* footer nav — every control in this row is the height of the primary CTA */}
        <div className="flex items-center justify-between border-t border-line px-6 py-2.5">
          <button
            onClick={prev}
            disabled={step === 0}
            className="grid h-10 w-10 place-items-center rounded-full border border-line text-muted transition-colors hover:text-fg disabled:opacity-30 sm:h-9 sm:w-9"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5">
            {Array.from({ length: STEPS }).map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                // The dot stays 6px; the button around it is 32px. A 6px tap target is not a control.
                className="grid h-8 place-items-center px-1 sm:h-5"
                aria-label={`Step ${i + 1}`}
                aria-current={i === step ? "step" : undefined}
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-accent" : "w-1.5 bg-line"}`}
                />
              </button>
            ))}
          </div>

          {step === STEPS - 1 ? (
            <Button variant="primary" size="md" onClick={finish}>
              Get started
            </Button>
          ) : (
            <button
              onClick={next}
              className="grid h-10 w-10 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent/50 hover:text-accent sm:h-9 sm:w-9"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* credit strip */}
        <div className="border-t border-line bg-panel-2/60 px-6 py-2 text-center text-micro text-faint">
          Mechanical Engineering Final-Year Project · <span className="text-muted">Ibidun Quyum Babatunde</span> ·{" "}
          <span className="num">2021/1/82451EM</span>
        </div>
      </div>
    </div>
  );
}

function ThemeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-meta transition-colors sm:py-1.5 ${active ? "bg-accent/15 font-medium text-accent" : "text-muted hover:text-fg"}`}
    >
      {icon}
      {label}
    </button>
  );
}
