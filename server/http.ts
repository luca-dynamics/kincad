// A fetch that gives up on a slow upstream instead of waiting forever. Every upstream request in the
// backend goes through this, because on Vercel a single hung call burns the whole function budget
// and the platform then kills the invocation with a bodyless 504 — the caller gets nothing and no
// explanation. Aborting ourselves turns that into an ordinary error the handler can report.

/** Ceiling for a single upstream HTTP call when the caller names no tighter one. */
export const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    // An abort surfaces as a generic DOMException named "AbortError"; rewrite it into a message that
    // names the cause, so the 502 the user sees says "timed out" rather than something opaque.
    if ((e as { name?: string })?.name === "AbortError") {
      throw new Error(`upstream timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
