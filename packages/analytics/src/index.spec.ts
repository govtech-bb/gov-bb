import {
  deriveStartEventName,
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
