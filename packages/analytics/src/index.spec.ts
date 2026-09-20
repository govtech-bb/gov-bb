import {
  canonicalEvent,
  deriveStartEventName,
  eventName,
  stepFromEvent,
  stepNumberToWord,
  trackEvent,
  trackPageview,
} from "./index";

describe("trackEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { umami?: unknown }).umami;
    vi.restoreAllMocks();
  });

  it("no-ops when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() =>
      trackEvent("search", { query: "x", results: 0 }),
    ).not.toThrow();
  });

  it("no-ops when window.umami is absent", () => {
    expect(() =>
      trackEvent("search", { query: "x", results: 0 }),
    ).not.toThrow();
  });

  it("forwards the event name when no data is given", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("form-open");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("form-open");
  });

  it("forwards both the event name and data when data has no form field", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("search", { query: "x", results: 0 });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("search", { query: "x", results: 0 });
  });

  it("masks PII in a search query before sending (#2079)", () => {
    const track = vi.fn();
    window.umami = { track };
    const data = {
      query: "john smith national insurance 1234567890",
      results: 3,
    };
    trackEvent("search", data);
    expect(track).toHaveBeenCalledWith("search", {
      query: "john smith national insurance 1********0",
      results: 3,
    });
    // caller's object is not mutated
    expect(data.query).toBe("john smith national insurance 1234567890");
  });
});

describe("trackPageview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { umami?: unknown }).umami;
    vi.restoreAllMocks();
  });

  it("no-ops when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => trackPageview()).not.toThrow();
  });

  it("no-ops when window.umami is absent", () => {
    expect(() => trackPageview()).not.toThrow();
  });

  it("calls umami.track() with no arguments to fire a pageview", () => {
    const track = vi.fn();
    window.umami = { track };
    trackPageview();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith();
  });
});

describe("deriveStartEventName", () => {
  it("derives a single-segment slug", () => {
    expect(deriveStartEventName("/renew-passport/start")).toBe(
      "renew-passport-start",
    );
  });

  it("joins nested paths with dashes", () => {
    expect(deriveStartEventName("/travel/renew-passport/start")).toBe(
      "travel-renew-passport-start",
    );
  });

  it("tolerates trailing slashes", () => {
    expect(deriveStartEventName("/renew-passport/start/")).toBe(
      "renew-passport-start",
    );
  });

  it("tolerates missing leading slash", () => {
    expect(deriveStartEventName("renew-passport/start")).toBe(
      "renew-passport-start",
    );
  });

  it("collapses an all-slashes path to the bare suffix", () => {
    expect(deriveStartEventName("///")).toBe("-start");
  });
});

describe("trackEvent slug prefixing", () => {
  afterEach(() => {
    delete (window as { umami?: unknown }).umami;
    vi.restoreAllMocks();
  });

  it("prefixes the event name with the form slug when data.form is present", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("form-start", {
      form: "renew-passport",
      category: "travel-id-citizenship",
    });
    expect(track).toHaveBeenCalledWith("renew-passport:form-start", {
      form: "renew-passport",
      category: "travel-id-citizenship",
    });
  });

  it("does NOT double-prefix an already-qualified name", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("renew-passport:form-step-one", {
      form: "renew-passport",
      category: "travel-id-citizenship",
      step: "personal-details",
    });
    expect(track).toHaveBeenCalledWith(
      "renew-passport:form-step-one",
      expect.any(Object),
    );
  });

  it("does not prefix when data has no form field", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("search", { query: "passport", results: 3 });
    expect(track).toHaveBeenCalledWith("search", {
      query: "passport",
      results: 3,
    });
  });
});

describe("stepNumberToWord", () => {
  it("maps 1..10 to words", () => {
    expect(stepNumberToWord(1)).toBe("one");
    expect(stepNumberToWord(10)).toBe("ten");
  });
  it("falls back to the digit beyond ten", () => {
    expect(stepNumberToWord(11)).toBe("11");
  });
});

describe("eventName — 50-char cap (#2682)", () => {
  const SHORT_ID = "get-birth-certificate"; // 21 chars
  const LONG_ID = "apply-for-temporary-restaurant-permit"; // 37 chars
  const LONGER_ID = "request-an-environmental-health-officer"; // 39 chars

  it("returns the full name when it fits (short-id forms unchanged)", () => {
    expect(eventName(SHORT_ID, "form-step-view")).toBe(
      "get-birth-certificate:form-step-view",
    );
    expect(eventName(SHORT_ID, "form-confirmation-view")).toBe(
      "get-birth-certificate:form-confirmation-view",
    );
  });

  it("falls back to a compact code when the full name would overflow 50", () => {
    expect(eventName(LONG_ID, "form-step-view")).toBe(`${LONG_ID}:sview`);
    expect(eventName(LONG_ID, "form-confirmation-view")).toBe(
      `${LONG_ID}:fconf`,
    );
    expect(eventName(LONG_ID, "form-validation-error")).toBe(
      `${LONG_ID}:fverr`,
    );
    expect(eventName(LONG_ID, "form-step-one")).toBe(`${LONG_ID}:s1`);
    // events short enough to fit keep their full name even on a long id
    expect(eventName(LONG_ID, "form-start")).toBe(`${LONG_ID}:form-start`);
  });

  it("keeps every produced name within the 50-char limit, incl. the longest id", () => {
    for (const id of [SHORT_ID, LONG_ID, LONGER_ID]) {
      for (const ev of [
        "form-start",
        "form-step-view",
        "form-confirmation-view",
        "form-validation-error",
        "form-step-ten",
      ]) {
        expect(eventName(id, ev).length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("distinguishes per-step events on a long id (no collision)", () => {
    const names = [1, 2, 3].map((n) =>
      eventName(LONG_ID, `form-step-${stepNumberToWord(n)}`),
    );
    expect(new Set(names).size).toBe(3);
  });

  it("truncates to 50 as a last resort for an unmapped overflowing event", () => {
    const name = eventName(LONGER_ID, "some-unmapped-really-long-event-name");
    expect(name.length).toBe(50);
    expect(name.startsWith(`${LONGER_ID}:`)).toBe(true);
  });
});

describe("canonicalEvent / stepFromEvent (#2682)", () => {
  it("maps a compact code back to its canonical event; passes through the rest", () => {
    expect(canonicalEvent("sview")).toBe("form-step-view");
    expect(canonicalEvent("fconf")).toBe("form-confirmation-view");
    expect(canonicalEvent("form-start")).toBe("form-start");
    expect(canonicalEvent("unknown")).toBe("unknown");
  });

  it("reads a step number from both full names and compact codes", () => {
    expect(stepFromEvent("form-step-one")).toBe(1);
    expect(stepFromEvent("form-step-ten")).toBe(10);
    expect(stepFromEvent("s3")).toBe(3);
    expect(stepFromEvent("s10")).toBe(10);
  });

  it("is null for non-step events (incl. the form-step-* non-steps)", () => {
    expect(stepFromEvent("form-step-view")).toBeNull();
    expect(stepFromEvent("form-step-back")).toBeNull();
    expect(stepFromEvent("sview")).toBeNull();
    expect(stepFromEvent("form-start")).toBeNull();
  });
});
