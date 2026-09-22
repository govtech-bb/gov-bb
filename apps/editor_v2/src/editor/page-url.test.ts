import { describe, expect, it } from "vitest";
import { buildUrl, servicesInUse, splitUrl } from "./page-url";

/** A subset of the real taxonomy — enough to cover the seeded pages. */
const CATEGORIES = [
  "business-trade",
  "health-and-emergency-services",
  "money-financial-support",
];

const SEEDED = [
  "/bank-holiday-calendar",
  "/business-trade/crop-over-permits",
  "/business-trade/crop-over-permits/form",
  "/health-and-emergency-services/find-an-open-pharmacy/find",
  "/money-financial-support/calculate-severance-pay/form",
  "/money-financial-support/calculate-severance-pay/start",
];

describe("taking a url apart", () => {
  it("reads category, service and path", () => {
    expect(
      splitUrl(
        "/health-and-emergency-services/find-an-open-pharmacy/find",
        CATEGORIES,
      ),
    ).toEqual({
      category: "health-and-emergency-services",
      service: "find-an-open-pharmacy",
      path: "find",
    });
  });

  it("reads a service with no path", () => {
    expect(splitUrl("/business-trade/crop-over-permits", CATEGORIES)).toEqual({
      category: "business-trade",
      service: "crop-over-permits",
      path: "",
    });
  });

  it("leaves the category empty for a top-level page", () => {
    // The seeded bank holiday calendar. Reading `bank-holiday-calendar` as a
    // category would invent a taxonomy entry that does not exist.
    expect(splitUrl("/bank-holiday-calendar", CATEGORIES)).toEqual({
      category: "",
      service: "bank-holiday-calendar",
      path: "",
    });
  });

  it("keeps a multi-segment path together", () => {
    expect(
      splitUrl("/business-trade/crop-over-permits/a/b/c", CATEGORIES),
    ).toEqual({
      category: "business-trade",
      service: "crop-over-permits",
      path: "a/b/c",
    });
  });
});

describe("putting a url back together", () => {
  it("round-trips every seeded page unchanged", () => {
    // The assertion that matters: composing the address must not rewrite the
    // addresses that already exist, or every page moves on first save.
    for (const url of SEEDED) {
      expect(buildUrl(splitUrl(url, CATEGORIES))).toBe(url);
    }
  });

  it("omits an empty category", () => {
    expect(
      buildUrl({ category: "", service: "bank-holiday-calendar", path: "" }),
    ).toBe("/bank-holiday-calendar");
  });

  it("tolerates stray slashes and spaces around a part", () => {
    expect(
      buildUrl({
        category: "business-trade",
        service: "/crop-over-permits/",
        path: " form ",
      }),
    ).toBe("/business-trade/crop-over-permits/form");
  });

  it("never produces a double slash or a trailing one", () => {
    expect(buildUrl({ category: "", service: "", path: "" })).toBe("/");
    expect(
      buildUrl({ category: "business-trade", service: "", path: "form" }),
    ).toBe("/business-trade/form");
  });
});

describe("the service picker's options", () => {
  it("lists every service already in use, once and sorted", () => {
    expect(servicesInUse(SEEDED, CATEGORIES)).toEqual([
      "bank-holiday-calendar",
      "calculate-severance-pay",
      "crop-over-permits",
      "find-an-open-pharmacy",
    ]);
  });
});
