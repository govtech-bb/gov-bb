import {
  bbDayKey,
  classifyType,
  clip,
  decodeEntities,
  freshnessLabel,
  isCurrentConcern,
  isPast,
  matchParishes,
  type Outage,
  parseEventWindow,
  stripHtml,
} from "./outages.domain";

// Fixed "now": June 23 2026, noon in Barbados (AST = UTC-4) → 16:00 UTC.
const NOW = Date.UTC(2026, 5, 23, 16, 0);

function outage(overrides: Partial<Outage> = {}): Outage {
  return {
    id: "x",
    title: "t",
    link: "l",
    published: new Date(NOW).toISOString(),
    summary: "s",
    parishes: [],
    type: "notice",
    ...overrides,
  };
}

describe("decodeEntities", () => {
  it("decodes numeric, hex and named entities", () => {
    expect(decodeEntities("Tom &#038; Jerry")).toBe("Tom & Jerry");
    expect(decodeEntities("a &#x26; b")).toBe("a & b");
    expect(decodeEntities("x &amp; y &lt; z")).toBe("x & y < z");
  });
  it("leaves unknown named entities untouched", () => {
    expect(decodeEntities("&notreal;")).toBe("&notreal;");
  });
});

describe("stripHtml", () => {
  it("removes tags, decodes entities and collapses whitespace", () => {
    expect(stripHtml("<p>Water   &amp;<br/> pipes</p>")).toBe("Water & pipes");
  });
});

describe("clip", () => {
  it("leaves short text unchanged", () => {
    expect(clip("short", 280)).toBe("short");
  });
  it("trims on a word boundary and adds an ellipsis", () => {
    const out = clip("the quick brown fox jumps", 12);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("brow…"); // no mid-word cut
    expect(out).toBe("the quick…");
  });
});

describe("classifyType", () => {
  it("classifies by wording", () => {
    expect(classifyType("Emergency burst main")).toBe("emergency");
    expect(classifyType("Crew to repair a station")).toBe("repair");
    expect(classifyType("Scheduled maintenance upgrade")).toBe("planned");
    expect(classifyType("General service notice")).toBe("notice");
  });
});

describe("matchParishes", () => {
  it("matches St./Saint/bare aliases", () => {
    expect(matchParishes("Work in St. Michael today")).toEqual([
      "saint-michael",
    ]);
    expect(matchParishes("Saint Michael area")).toEqual(["saint-michael"]);
    expect(matchParishes("Affecting Christ Church")).toEqual(["christ-church"]);
  });
  it("returns multiple and empty correctly", () => {
    expect(matchParishes("St. Peter and St. Lucy")).toEqual([
      "saint-lucy",
      "saint-peter",
    ]);
    expect(matchParishes("island-wide notice")).toEqual([]);
  });
});

describe("parseEventWindow", () => {
  it("extracts the Barbados day and the end of the time window", () => {
    const { eventDay, endsAt } = parseEventWindow(
      "Work on Tuesday, June 23rd between 9:00 a.m. and 7:00 p.m.",
      new Date(NOW).toISOString(),
    );
    expect(eventDay).toBe("2026-06-23");
    // 7:00 p.m. AST == 23:00 UTC.
    expect(endsAt).toBe(new Date(Date.UTC(2026, 5, 23, 23, 0)).toISOString());
  });
  it("returns empty when no date is present", () => {
    expect(
      parseEventWindow("no date here", new Date(NOW).toISOString()),
    ).toEqual({});
  });
});

describe("bbDayKey", () => {
  it("returns the Barbados calendar day", () => {
    expect(bbDayKey(new Date(NOW))).toBe("2026-06-23");
  });
});

describe("isPast / isCurrentConcern / freshnessLabel", () => {
  it("labels today, tomorrow, future and ended", () => {
    expect(freshnessLabel(outage({ eventDay: "2026-06-23" }), NOW)).toBe(
      "Today",
    );
    expect(freshnessLabel(outage({ eventDay: "2026-06-24" }), NOW)).toBe(
      "Tomorrow",
    );
    expect(freshnessLabel(outage({ eventDay: "2026-06-25" }), NOW)).toBe(
      "25 Jun",
    );
    expect(freshnessLabel(outage({ eventDay: "2026-06-20" }), NOW)).toBe(
      "Ended",
    );
  });
  it("treats a finished window as past", () => {
    const ended = outage({
      endsAt: new Date(NOW - 3_600_000).toISOString(),
    });
    expect(isPast(ended, NOW)).toBe(true);
    expect(isCurrentConcern(ended, NOW)).toBe(false);
  });
  it("treats an upcoming day as a current concern", () => {
    const upcoming = outage({ eventDay: "2026-06-24" });
    expect(isPast(upcoming, NOW)).toBe(false);
    expect(isCurrentConcern(upcoming, NOW)).toBe(true);
  });
});
