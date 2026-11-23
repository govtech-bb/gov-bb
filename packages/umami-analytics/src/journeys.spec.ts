import { describe, expect, it } from "vitest";
import { humanizeStep, shapeJourneyList } from "./journeys";

describe("humanizeStep", () => {
  it("labels service pages, the home path, and qualifies Start/Form with the root", () => {
    expect(
      humanizeStep("/family-birth-relationships/get-birth-certificate"),
    ).toBe("Get birth certificate");
    expect(humanizeStep("/")).toBe("Home");
    // form-start event → "<root> · Start"
    expect(humanizeStep("get-birth-certificate:form-start")).toBe(
      "Get birth certificate · Start",
    );
    // /start and /form pages are qualified with the service segment above them
    expect(
      humanizeStep("/money-financial-support/get-a-textbook-grant/start"),
    ).toBe("Get a textbook grant · Start");
    expect(
      humanizeStep("/money-financial-support/get-a-textbook-grant/form"),
    ).toBe("Get a textbook grant · Form");
  });

  it("recognises a long-id form's compact start code (#2682)", () => {
    // A 40–44 char id emits `:fstrt` instead of `:form-start`; it must still
    // resolve to the Start goal, not render as "Fstrt".
    expect(humanizeStep("some-long-licence-form:fstrt")).toBe(
      "Some long licence form · Start",
    );
    // a compact per-event code resolves to its canonical label, not "Sview"
    expect(humanizeStep("some-long-licence-form:fverr")).toBe(
      "Form validation error",
    );
  });
});

describe("shapeJourneyList", () => {
  it("uses pages only, drops form-start-event variants so journeys merge", () => {
    const rows = shapeJourneyList([
      // these three are the same page journey with different event noise — they
      // must all collapse to Home › Passport › Start
      {
        items: ["/", "/passport", "/passport/start", "passport:form-start"],
        count: 40,
      },
      {
        items: ["/", "/passport", "passport:form-start", "/passport/start"],
        count: 30,
      },
      { items: ["/", "/passport", "/passport/start"], count: 9 },
      { items: ["/", "/births"], count: 20 },
      // single-page visit (bounce) — excluded
      { items: ["/", null, null], count: 500 },
    ]);
    expect(rows[0].items).toEqual(["Home", "Passport", "Start"]);
    expect(rows[0].sessions).toBe(79); // 40 + 30 + 9 merged
    expect(rows[1].items).toEqual(["Home", "Births"]);
    expect(rows[1].sessions).toBe(20);
    // bounce excluded → total is 79 + 20 = 99, not 599
    expect(rows[0].share).toBeCloseTo(79 / 99);
    expect(rows.some((r) => r.items.length < 2)).toBe(false);
    expect(rows[0].entryPath).toBe("/"); // entry step is Home
  });

  it("qualifies the entry step with its service when it is a start/form page", () => {
    const rows = shapeJourneyList([
      {
        items: [
          "/money-financial-support/get-a-textbook-grant/start",
          "/money-financial-support/get-a-textbook-grant/form",
        ],
        count: 12,
      },
    ]);
    // entry is a /start page → qualified; later steps stay bare
    expect(rows[0].items).toEqual(["Get a textbook grant · Start", "Form"]);
    expect(rows[0].entryPath).toBe(
      "/money-financial-support/get-a-textbook-grant/start",
    );
  });
});
