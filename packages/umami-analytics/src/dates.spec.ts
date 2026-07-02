import { describe, expect, it } from "vitest";
import { buildPresets, startOfDayInTz, tzOffsetMs } from "./dates";

// 2026-06-15T18:30:00Z → 14:30 local in Barbados (UTC-4, no DST).
const NOW = new Date("2026-06-15T18:30:00Z");
const TZ = "America/Barbados";

describe("tzOffsetMs", () => {
  it("is -4h for Barbados (behind UTC)", () => {
    expect(tzOffsetMs(TZ, NOW)).toBe(-4 * 3600_000);
  });
});

describe("startOfDayInTz", () => {
  it("returns Barbados midnight (04:00Z) for today", () => {
    expect(startOfDayInTz(TZ, NOW, 0)).toBe(Date.UTC(2026, 5, 15, 4));
  });
  it("walks back whole calendar days", () => {
    expect(startOfDayInTz(TZ, NOW, 6)).toBe(Date.UTC(2026, 5, 9, 4));
  });
});

describe("buildPresets", () => {
  const presets = buildPresets(TZ, NOW);
  const by = (k: string) => presets.find((p) => p.key === k)!;

  it("exposes the five dashboard presets in order", () => {
    expect(presets.map((p) => p.key)).toEqual([
      "today",
      "last-7-days",
      "last-30-days",
      "last-60-days",
      "last-90-days",
    ]);
  });

  it("ends every range at now", () => {
    for (const p of presets) expect(p.range.endAt).toBe(NOW.getTime());
  });

  it("aligns 'Today' to start-of-day in the timezone", () => {
    expect(by("today").range.startAt).toBe(Date.UTC(2026, 5, 15, 4));
  });

  it("'Last 7 days' starts 6 calendar days before today (not rolling 7×24h)", () => {
    expect(by("last-7-days").range.startAt).toBe(Date.UTC(2026, 5, 9, 4));
  });

  it("'Last 30 days' starts 29 calendar days before today", () => {
    expect(by("last-30-days").range.startAt).toBe(Date.UTC(2026, 4, 17, 4));
  });
});
