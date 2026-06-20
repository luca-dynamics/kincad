// Voice chat via the browser Web Speech API — no server, no API key, no quota burn.
//   • Speech-to-text  (SpeechRecognition)  → dictate questions into the composer
//   • Text-to-speech  (speechSynthesis)    → read the agent's reply aloud
// Works in Chromium browsers (Chrome / Edge) — the FYP demo target.

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings (Web Speech API isn't in the standard TS DOM lib).
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

/**
 * Dictation. Calls `onTranscript(textSoFar)` with the accumulating transcript while the user
 * speaks, so the caller can live-update the composer. Resolves to a final string on stop.
 */
export function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef(""); // text already in the field when dictation started
  const supported = !!getRecognitionCtor();

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(
    (existing: string) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) return;
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      baseRef.current = existing ? existing.trimEnd() + " " : "";

      rec.onresult = (e) => {
        let str = "";
        for (let i = 0; i < e.results.length; i++) {
          str += e.results[i][0].transcript;
        }
        onTranscript((baseRef.current + str).trimStart());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);

      recRef.current = rec;
      rec.start();
      setListening(true);
    },
    [onTranscript],
  );

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, start, stop };
}

/** Read text aloud. Returns controls + which message id (if any) is currently speaking. */
export function useSpeechSynthesis() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (text: string, id: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      // Strip markdown / LaTeX noise so it reads naturally.
      const clean = text
        .replace(/\$\$?([^$]*)\$\$?/g, "$1") // math delimiters
        .replace(/[*_`#>|]/g, "")            // md symbols
        .replace(/\\[a-zA-Z]+/g, "")          // latex commands like \le, \circ
        .replace(/\s+/g, " ")
        .trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = "en-US";
      u.rate = 1.0;
      u.onend = () => setSpeakingId(null);
      u.onerror = () => setSpeakingId(null);
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  return { supported, speakingId, speak, cancel };
}
