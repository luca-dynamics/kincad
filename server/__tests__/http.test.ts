// The backend's timeout wrapper. `server/` is outside every tsconfig `include`, so nothing here is
// type-checked (see the note in gateway.test.ts) — this is the only thing asserting that a hung
// upstream is turned into a reported error rather than a silent function kill.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "../http.ts";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithTimeout", () => {
  it("aborts a call that outlasts the timeout and names the cause", async () => {
    // A fetch that only ever settles when its signal aborts — i.e. a hung upstream.
    vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      }),
    );
    await expect(fetchWithTimeout("https://x/y", { method: "POST" }, 20)).rejects.toThrow(/timed out/);
  });

  it("returns the response untouched when the call is fast enough", async () => {
    vi.stubGlobal("fetch", async () => new Response("ok", { status: 200 }));
    const res = await fetchWithTimeout("https://x/y", {}, 1000);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("passes an ordinary network error through as itself, not as a timeout", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ENOTFOUND x");
    });
    await expect(fetchWithTimeout("https://x/y", {}, 1000)).rejects.toThrow("ENOTFOUND x");
  });

  it("forwards method, headers and body to the underlying fetch", async () => {
    let seen: { url: string; init: { method?: string; headers?: unknown; body?: string } } | undefined;
    vi.stubGlobal("fetch", async (url: string, init: { method?: string; headers?: unknown; body?: string }) => {
      seen = { url, init };
      return new Response("{}", { status: 200 });
    });
    await fetchWithTimeout("https://x/y", { method: "POST", headers: { a: "b" }, body: "hi" }, 1000);
    expect(seen?.url).toBe("https://x/y");
    expect(seen?.init.method).toBe("POST");
    expect(seen?.init.headers).toEqual({ a: "b" });
    expect(seen?.init.body).toBe("hi");
  });
});
