import {
  canonicalEvent,
  deriveStartEventName,
  eventFormKey,
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
  // A real public form id (84 chars) — longer than any suffix can rescue, so it
  // exercises the hashed-key path.
  const HUGE_ID =
    "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026";

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

  it("keeps every produced name within 50 chars, incl. the longest id and steps 11+", () => {
    const events = [
      "form-start",
      "form-step-view",
      "form-confirmation-view",
      "form-validation-error",
      ...Array.from(
        { length: 16 },
        (_, i) => `form-step-${stepNumberToWord(i + 1)}`,
      ),
    ];
    for (const id of [SHORT_ID, LONG_ID, LONGER_ID, HUGE_ID]) {
      for (const ev of events) {
        expect(eventName(id, ev).length).toBeLessThanOrEqual(50);
      }
    }
  });

  it("distinguishes per-step events on a long id (no collision)", () => {
    const names = Array.from({ length: 16 }, (_, i) =>
      eventName(LONG_ID, `form-step-${stepNumberToWord(i + 1)}`),
    );
    expect(new Set(names).size).toBe(16);
  });

  it("codes steps 11+ as s<n> (not a colliding fallback)", () => {
    // 39-char id: `…:form-step-11` (52) overflows, so it compacts.
    expect(eventName(LONGER_ID, "form-step-11")).toBe(`${LONGER_ID}:s11`);
    expect(eventName(LONGER_ID, "form-step-16")).toBe(`${LONGER_ID}:s16`);
    // step 11 and step 1 stay distinct (the old fallback collided them)
    expect(eventName(LONGER_ID, "form-step-11")).not.toBe(
      eventName(LONGER_ID, "form-step-one"),
    );
  });

  it("truncates to 50 as a last resort for an unmapped overflowing event", () => {
    const name = eventName(LONGER_ID, "some-unmapped-really-long-event-name");
    expect(name.length).toBe(50);
    expect(name.startsWith(`${LONGER_ID}:`)).toBe(true);
  });
});

describe("eventFormKey — ids longer than 44 chars (#2682)", () => {
  const HUGE_ID =
    "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026";

  it("returns the id unchanged when it is 44 chars or fewer", () => {
    expect(eventFormKey("get-birth-certificate")).toBe("get-birth-certificate");
    expect(eventFormKey("a".repeat(44))).toBe("a".repeat(44));
  });

  it("hashes a too-long id to a stable key that keeps event names within 50", () => {
    const key = eventFormKey(HUGE_ID);
    expect(key.length).toBeLessThanOrEqual(44);
    expect(key).toContain("~");
    // deterministic
    expect(eventFormKey(HUGE_ID)).toBe(key);
    // one key per form: every event shares the same prefix, so aggregation groups them
    const prefix = (ev: string) => eventName(HUGE_ID, ev).split(":")[0];
    expect(prefix("form-start")).toBe(key);
    expect(prefix("form-step-view")).toBe(key);
    expect(prefix("form-step-13")).toBe(key);
    // and the public form that was fully broken before now yields a usable name
    expect(eventName(HUGE_ID, "form-step-view").length).toBeLessThanOrEqual(50);
    expect(eventName(HUGE_ID, "form-step-view")).toContain(":");
  });

  it("distinct too-long ids get distinct keys", () => {
    expect(eventFormKey(HUGE_ID)).not.toBe(eventFormKey(HUGE_ID + "-v2"));
  });
});

describe("canonicalEvent / stepFromEvent (#2682)", () => {
  it("maps a compact code back to its canonical event; passes through the rest", () => {
    expect(canonicalEvent("sview")).toBe("form-step-view");
    expect(canonicalEvent("fconf")).toBe("form-confirmation-view");
    expect(canonicalEvent("form-start")).toBe("form-start");
    expect(canonicalEvent("unknown")).toBe("unknown");
  });

  it("reads a step number from full word names, numeric names (11+) and compact codes", () => {
    expect(stepFromEvent("form-step-one")).toBe(1);
    expect(stepFromEvent("form-step-ten")).toBe(10);
    // steps 11+ are emitted numerically (stepNumberToWord(11) === "11") — these
    // were previously uncounted on short-id forms with >10 steps.
    expect(stepFromEvent("form-step-11")).toBe(11);
    expect(stepFromEvent("form-step-22")).toBe(22);
    expect(stepFromEvent("s3")).toBe(3);
    expect(stepFromEvent("s11")).toBe(11);
  });

  it("is null for non-step events (incl. the form-step-* non-steps)", () => {
    expect(stepFromEvent("form-step-view")).toBeNull();
    expect(stepFromEvent("form-step-back")).toBeNull();
    expect(stepFromEvent("sview")).toBeNull();
    expect(stepFromEvent("form-start")).toBeNull();
  });
});
