import { vi } from "vitest";

// @testing-library/dom's waitFor decides between real and fake timer handling
// by probing the global `jest` object — without this alias it assumes real
// timers while vi.useFakeTimers() is active and every waitFor times out.
(globalThis as Record<string, unknown>).jest = vi;

// jsdom has no layout or media engine; real scrolling and popup positioning
// are checked in the browser, while component tests exercise their behavior.
if (typeof window !== "undefined") {
  window.matchMedia ??= (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.getAnimations ??= () => [];
}
