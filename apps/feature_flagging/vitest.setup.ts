import { vi } from "vitest";

// @testing-library/dom's waitFor decides between real and fake timer handling
// by probing the global `jest` object — without this alias it assumes real
// timers while vi.useFakeTimers() is active and every waitFor times out.
(globalThis as Record<string, unknown>).jest = vi;
