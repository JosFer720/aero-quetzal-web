import { beforeEach, vi } from "vitest";

// Node 25 exposes its own disk-backed storage globally. Browser tests must use
// the actual jsdom storage, including real length/getItem/setItem semantics.
beforeEach(() => {
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
  vi.stubGlobal("localStorage", jsdom.window.localStorage);
  vi.stubGlobal("sessionStorage", jsdom.window.sessionStorage);
});
