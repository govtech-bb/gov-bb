import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// @testing-library/dom's waitFor decides between real and fake timer handling
// by probing the global `jest` object — without this alias it assumes real
// timers while vi.useFakeTimers() is active and every waitFor times out.
(globalThis as Record<string, unknown>).jest = vi;

// jsdom has no layout or media engine; real scrolling and popup positioning
// are checked in the browser, while component tests exercise their behavior.
if (typeof window !== "undefined") {
  // findBy*/waitFor default to 1s. Under CI's full-suite load, mounting the
  // router and a workspace can outlast that, so specs flaked on waits that
  // pass alone (-services.spec.tsx). 3s stays well under testTimeout (10s), so
  // a stuck wait still reports its own error and DOM. Imported here so
  // node-environment specs don't load React DOM.
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 3000 });
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
