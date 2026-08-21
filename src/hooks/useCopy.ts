// Copy-to-clipboard with a short "Copied" flash — one implementation for every copy affordance in
// the app: the code-fence header in chat/Markdown.tsx and the Copy button on both chat bubbles.
//
// It is a hook rather than a shared button because those two call sites don't share markup: the
// fence header uses `Button` from ui.tsx, while the bubble action row has its own bespoke
// `h-8 sm:h-7 text-mini text-faint` treatment sitting alongside Listen and Export. What they do
// share is the part worth getting right once — the guard, the failure behaviour, and the timing.
//
// THE FAILURE PATH IS THE POINT. `navigator.clipboard` is absent in an insecure context and
// `writeText` *rejects* whenever the document isn't focused, so an unguarded call throws an
// unhandled rejection and an optimistic `setCopied(true)` would claim a copy that never happened.
// Both are handled here: optional chaining short-circuits the missing API before `.then`, and the
// `.catch` leaves the label on "Copy" — the honest signal that nothing was written.

import { useCallback, useEffect, useRef, useState } from "react";

/** @param resetMs how long the "Copied" state holds before reverting. */
export function useCopy(resetMs = 1200) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // A bubble can unmount while the flash is pending — switching conversations re-renders the whole
  // thread — so the pending revert is dropped with it rather than left running.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    (text: string) => {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => {
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), resetMs);
        })
        .catch(() => {
          /* denied, or the document isn't focused — say nothing rather than lie about it */
        });
    },
    [resetMs],
  );

  return { copied, copy };
}
