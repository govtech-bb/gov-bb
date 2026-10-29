import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

// findBy*/waitFor default to 1s. Under CI's full-suite load, mounting the
// router and a workspace can outlast that, so specs flaked on waits that pass
// alone (-services.spec.tsx). testTimeout (10s) still bounds a real hang.
configure({ asyncUtilTimeout: 5000 });

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
