import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Run as CI does, in UTC, where a date in the runner's own zone would be a day ahead of Barbados in the evening
beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a timestamp shows its day and time in Barbados, four hours behind UTC", async () => {
  const { formatDay, formatDayAndTime } = await import("./dates");

  expect(formatDay("2026-10-08T02:30:00.000Z")).toBe("7 Oct 2026");
  expect(formatDayAndTime("2026-10-08T02:30:00.000Z")).toBe("7 Oct 2026, 22:30");
});

test("a calendar day such as a publish_date keeps its day", async () => {
  const { formatCalendarDay } = await import("./dates");

  expect(formatCalendarDay("2026-10-07")).toBe("7 Oct 2026");
});

test("a page made public in the evening is dated that day, and a day carried over from Markdown keeps it", async () => {
  const { barbadosDay } = await import("./dates");

  expect(barbadosDay("2026-10-08T02:30:00.000Z")).toBe("2026-10-07");
  expect(barbadosDay("2026-10-07T00:00:00.000Z")).toBe("2026-10-07");
});
