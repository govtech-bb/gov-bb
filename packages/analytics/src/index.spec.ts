import { deriveStartEventName, trackEvent, trackPageview } from "./index";

describe("trackEvent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { umami?: unknown }).umami;
    vi.restoreAllMocks();
  });

  it("no-ops when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => trackEvent("form-open")).not.toThrow();
  });

  it("no-ops when window.umami is absent", () => {
    expect(() => trackEvent("form-open")).not.toThrow();
  });

  it("forwards the event name when no data is given", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("form-open");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("form-open");
  });

  it("forwards both the event name and data when data is given", () => {
    const track = vi.fn();
    window.umami = { track };
    trackEvent("form-step-view", {
      form_id: "renew-passport",
      step_id: "personal-details",
      step_index: 2,
      step_count: 7,
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("form-step-view", {
      form_id: "renew-passport",
      step_id: "personal-details",
      step_index: 2,
      step_count: 7,
    });
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
});
