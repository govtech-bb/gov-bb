import { describe, expect, it } from "vitest";
import { comparisonPeriods } from "./periods";

const TZ = "America/Barbados";
// Wednesday 2026-11-04 14:30 local (UTC-4).
const NOW = new Date("2026-11-04T18:30:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("comparisonPeriods", () => {
  it("today: today so far vs all of yesterday", () => {
    const { current, previous } = comparisonPeriods("today", TZ, NOW);
    expect(iso(current.startAt)).toBe("2026-11-04T04:00:00.000Z");
    expect(current.endAt).toBe(NOW.getTime());
    expect(iso(previous.startAt)).toBe("2026-11-03T04:00:00.000Z");
    expect(iso(previous.endAt)).toBe("2026-11-04T03:59:59.999Z");
  });

  it("week: last Monday–Sunday vs the week before", () => {
    const { current, previous } = comparisonPeriods("week", TZ, NOW);
    expect(iso(current.startAt)).toBe("2026-10-26T04:00:00.000Z");
    expect(iso(current.endAt)).toBe("2026-11-02T03:59:59.999Z");
    expect(iso(previous.startAt)).toBe("2026-10-19T04:00:00.000Z");
    expect(iso(previous.endAt)).toBe("2026-10-26T03:59:59.999Z");
  });

  it("week: on a Monday, last week is the seven days just ended", () => {
    const monday = new Date("2026-11-02T13:00:00Z");
    const { current } = comparisonPeriods("week", TZ, monday);
    expect(iso(current.startAt)).toBe("2026-10-26T04:00:00.000Z");
    expect(iso(current.endAt)).toBe("2026-11-02T03:59:59.999Z");
  });

  it("week: late Sunday local time still counts as the current week", () => {
    // 2026-11-08 23:30 local is 2026-11-09 03:30Z (already Monday in UTC).
    const sunday = new Date("2026-11-09T03:30:00Z");
    const { current } = comparisonPeriods("week", TZ, sunday);
    expect(iso(current.startAt)).toBe("2026-10-26T04:00:00.000Z");
  });

  it("month: last calendar month vs the month before", () => {
    const { current, previous } = comparisonPeriods("month", TZ, NOW);
    expect(iso(current.startAt)).toBe("2026-10-01T04:00:00.000Z");
    expect(iso(current.endAt)).toBe("2026-11-01T03:59:59.999Z");
    expect(iso(previous.startAt)).toBe("2026-09-01T04:00:00.000Z");
    expect(iso(previous.endAt)).toBe("2026-10-01T03:59:59.999Z");
  });

  it("month: crosses the year boundary in January", () => {
    const jan = new Date("2027-01-15T12:00:00Z");
    const { current, previous } = comparisonPeriods("month", TZ, jan);
    expect(iso(current.startAt)).toBe("2026-12-01T04:00:00.000Z");
    expect(iso(previous.startAt)).toBe("2026-11-01T04:00:00.000Z");
  });
});
