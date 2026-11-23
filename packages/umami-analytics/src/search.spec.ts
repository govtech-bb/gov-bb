import { describe, expect, it } from "vitest";
import { shapeSearch } from "./search";

describe("shapeSearch", () => {
  it("joins query counts, per-query clicks and zero-result flags into a ranked table", () => {
    const out = shapeSearch(
      [
        { value: "passport", total: 100 },
        { value: "birth certificate", total: 40 },
        { value: "xyzzy", total: 10 },
      ],
      [
        { value: 0, total: 15 },
        { value: 3, total: 135 },
      ],
      [
        { value: "passport", total: 60 },
        { value: "birth certificate", total: 10 },
      ],
      [{ value: "xyzzy", total: 10 }],
    );

    // overall: searches = 150, clicks = 70, ctr = 70/150 (stored 0–1).
    expect(out.searches).toBe(150);
    expect(out.clicks).toBe(70);
    expect(out.ctr).toBeCloseTo(70 / 150);
    // zero-result rate from the results distribution: 15 / 150.
    expect(out.zeroResultRate).toBeCloseTo(0.1);

    // ranked by searches, each with its own CTR (0–1) and zero-result flag.
    expect(out.queries.map((q) => q.query)).toEqual([
      "passport",
      "birth certificate",
      "xyzzy",
    ]);
    expect(out.queries[0]).toEqual({
      query: "passport",
      searches: 100,
      clicks: 60,
      ctr: 0.6,
      zeroResult: false,
    });
    expect(out.queries[2]).toMatchObject({
      query: "xyzzy",
      clicks: 0,
      ctr: 0,
      zeroResult: true,
    });
  });

  it("takes total searches from the results distribution when the query distribution is row-capped", () => {
    // The query rows are truncated (only the top term survived a row cap), but
    // the low-cardinality results distribution carries the true total of 100.
    const out = shapeSearch(
      [{ value: "passport", total: 20 }],
      [
        { value: 0, total: 10 },
        { value: 4, total: 90 },
      ],
      [{ value: "passport", total: 25 }],
      [],
    );
    expect(out.searches).toBe(100); // max(20, 100), not the truncated 20
    expect(out.ctr).toBeCloseTo(25 / 100); // CTR is not inflated by truncation
    expect(out.zeroResultRate).toBeCloseTo(0.1);
  });

  it("caps the table at topN and degrades to zeros on empty input", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      value: `q${i}`,
      total: 25 - i,
    }));
    expect(shapeSearch(many, [], [], [], 20).queries).toHaveLength(20);

    const empty = shapeSearch([], [], [], []);
    expect(empty).toMatchObject({
      searches: 0,
      clicks: 0,
      ctr: 0,
      zeroResultRate: 0,
      queries: [],
    });
  });
});
