import {
  canonicalEvent,
  configureJourney,
  deriveStartEventName,
  eventFormKey,
  eventName,
  flushJourney,
  installClickListener,
  journeyEvent,
  stepFromEvent,
  stepNumberToWord,
  trackEvent,
  trackPageview,
  UMAMI_SCRIPT_ATTRIBUTES,
} from "./index";
import { resetJourneyForTests } from "./journey";
import type { Mock } from "vitest";

// The payload Umami's tracker builds itself. With auto-track off, its url and
// referrer are the ones it read when the page first loaded (#3586).
const TRACKER_PAYLOAD = {
  website: "site-id",
  title: "Page title",
  url: "/entry",
  referrer: "https://www.google.com/",
};

type Track = NonNullable<Window["umami"]>["track"];

/** What Umami would send for one track() call: runs the function we passed. */
function sentPayload(track: Mock<Track>, call = 0) {
  const arg = track.mock.calls[call][0];
  if (typeof arg !== "function") {
    throw new Error(`track() got ${typeof arg}, not a function`);
  }
  return arg(TRACKER_PAYLOAD);
}

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
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("form-open");
    expect(track).toHaveBeenCalledTimes(1);
    expect(sentPayload(track)).toMatchObject({ name: "form-open" });
    expect(sentPayload(track).data).toBeUndefined();
  });

  it("forwards both the event name and data when data has no form field", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("search", { query: "x", results: 0 });
    expect(track).toHaveBeenCalledTimes(1);
    expect(sentPayload(track)).toMatchObject({
      name: "search",
      data: { query: "x", results: 0 },
    });
  });

  it("masks PII in a search query before sending (#2079)", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    const data = {
      query: "john smith national insurance 1234567890",
      results: 3,
    };
    trackEvent("search", data);
    expect(sentPayload(track).data).toEqual({
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

  it("calls umami.track() once to fire a pageview", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackPageview();
    expect(track).toHaveBeenCalledTimes(1);
    // Umami treats a payload with a name as an event, not a page view.
    expect(sentPayload(track).name).toBeUndefined();
  });
});

describe("Umami url and referrer (#3586)", () => {
  // A fresh module per test, so the remembered page doesn't leak between tests.
  let analytics: typeof import("./index");
  let track: Mock<Track>;

  beforeEach(async () => {
    vi.resetModules();
    analytics = await import("./index");
    track = vi.fn<Track>();
    window.umami = { track };
    history.replaceState(null, "", "/entry");
  });

  afterEach(() => {
    delete (window as { umami?: unknown }).umami;
    history.replaceState(null, "", "/");
  });

  it("a page view sends the current path, not the URL the page loaded on", () => {
    history.pushState(null, "", "/services");
    analytics.trackPageview();
    expect(sentPayload(track)).toMatchObject({
      url: "/services",
      website: "site-id",
      title: "Page title",
    });
  });

  it("sends the path only, never the query string or hash (#3503)", () => {
    history.pushState(null, "", "/water/confirm?token=secret-token#top");
    analytics.trackPageview();
    const payload = sentPayload(track);
    expect(payload.url).toBe("/water/confirm");
    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });

  it("the first page view keeps the tracker's own referrer", () => {
    analytics.trackPageview();
    expect(sentPayload(track).referrer).toBe("https://www.google.com/");
  });

  it("the next page view names the previous path as its referrer", () => {
    analytics.trackPageview();
    history.pushState(null, "", "/services");
    analytics.trackPageview();
    expect(sentPayload(track, 1)).toMatchObject({
      url: "/services",
      referrer: "/entry",
    });
  });

  it("a page view before Umami loads still counts as the next referrer", () => {
    delete (window as { umami?: unknown }).umami;
    analytics.trackPageview();
    window.umami = { track };
    history.pushState(null, "", "/services");
    analytics.trackPageview();
    expect(sentPayload(track).referrer).toBe("/entry");
  });

  // Forms sends a page view on every ?step= change, on the same path. Umami
  // itself skips those; ours must not become their own referrer.
  it("a page view on the same path keeps the page's referrer", () => {
    analytics.trackPageview();
    history.pushState(null, "", "/services");
    analytics.trackPageview();
    history.pushState(null, "", "/services?step=two");
    analytics.trackPageview();
    expect(sentPayload(track, 2)).toMatchObject({
      url: "/services",
      referrer: "/entry",
    });
  });

  it("the first page's same-path page views keep the tracker's referrer", () => {
    analytics.trackPageview();
    history.pushState(null, "", "/entry?step=two");
    analytics.trackPageview();
    analytics.trackEvent("form-step-two");
    expect(sentPayload(track, 1).referrer).toBe("https://www.google.com/");
    expect(sentPayload(track, 2).referrer).toBe("https://www.google.com/");
  });

  it("an event before its page's page view names the last page", () => {
    analytics.trackPageview();
    history.pushState(null, "", "/services");
    analytics.trackEvent("search", { results: 0 });
    expect(sentPayload(track, 1)).toMatchObject({
      url: "/services",
      referrer: "/entry",
    });
  });

  it("an event sends the current path and its page view's referrer", () => {
    analytics.trackPageview();
    history.pushState(null, "", "/services");
    analytics.trackPageview();
    analytics.trackEvent("service-click", { slug: "renew-passport" });
    expect(sentPayload(track, 2)).toMatchObject({
      name: "service-click",
      data: { slug: "renew-passport" },
      url: "/services",
      referrer: "/entry",
      title: "Page title",
    });
  });

  it("an event before any page view keeps the tracker's own referrer", () => {
    history.pushState(null, "", "/services?q=secret-search");
    analytics.trackEvent("search", { results: 0 });
    const payload = sentPayload(track);
    expect(payload).toMatchObject({
      name: "search",
      url: "/services",
      referrer: "https://www.google.com/",
    });
    expect(JSON.stringify(payload)).not.toContain("secret-search");
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
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("form-start", {
      form: "renew-passport",
      category: "travel-id-citizenship",
    });
    expect(sentPayload(track)).toMatchObject({
      name: "renew-passport:form-start",
      data: { form: "renew-passport", category: "travel-id-citizenship" },
    });
  });

  it("does NOT double-prefix an already-qualified name", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("renew-passport:form-step-one", {
      form: "renew-passport",
      category: "travel-id-citizenship",
      step: "personal-details",
    });
    expect(sentPayload(track).name).toBe("renew-passport:form-step-one");
  });

  it("does not prefix when data has no form field", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("search", { query: "passport", results: 3 });
    expect(sentPayload(track)).toMatchObject({
      name: "search",
      data: { query: "passport", results: 3 },
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

describe("journey events from trackEvent / trackPageview", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
    configureJourney({ url: "https://api.example/journey", app: "forms" });
  });

  afterEach(() => {
    resetJourneyForTests();
    delete (window as { umami?: unknown }).umami;
  });

  const sent = () =>
    beacon.mock.calls.flatMap((c) => JSON.parse(c[1] as string)) as Record<
      string,
      unknown
    >[];

  it("sends a journey event even when Umami is not loaded", () => {
    trackEvent("search", { query: "jane@example.com", results: 3 });
    trackPageview();
    flushJourney();
    expect(sent().map((e) => e.event)).toEqual(["search", "pageview"]);
    // The search query is masked before it leaves, as for Umami.
    expect((sent()[0].props as { query: string }).query).not.toContain("jane");
  });

  it("sends to both when Umami is loaded", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("form-start", { form: "get-birth-certificate", category: "x" });
    flushJourney();
    expect(sentPayload(track).name).toBe("get-birth-certificate:form-start");
    expect(sent()[0]).toMatchObject({
      event: "form-start",
      props: { form: "get-birth-certificate" },
    });
  });

  it("sends the journey ID to /journey and never to Umami", () => {
    const track = vi.fn<Track>();
    window.umami = { track };
    trackEvent("form-start", { form: "get-birth-certificate", category: "x" });
    trackPageview();
    flushJourney();
    expect(sent()[0].journey_id).toMatch(/^[0-9a-f-]{36}$/);
    for (const [arg] of track.mock.calls) {
      const payload = typeof arg === "function" ? arg(TRACKER_PAYLOAD) : arg;
      expect(JSON.stringify(payload)).not.toContain(
        sent()[0].journey_id as string,
      );
      expect(JSON.stringify(payload)).not.toContain("journey");
    }
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("unpacks Umami's packed per-step names", () => {
    trackEvent(eventName("get-birth-certificate", "form-step-three"), {
      form: "get-birth-certificate",
    });
    const longId = "apply-for-a-very-long-named-licence-from-a-ministry-x";
    trackEvent(eventName(longId, "form-step-three"));
    flushJourney();
    expect(sent()[0]).toMatchObject({
      event: "form-step-three",
      props: { form: "get-birth-certificate" },
    });
    expect(sent()[1]).toMatchObject({
      event: "form-step-three",
      props: { form: eventFormKey(longId) },
    });
  });
});

describe("journeyEvent", () => {
  it("leaves plain names alone", () => {
    expect(journeyEvent("search", { query: "x" })).toEqual([
      "search",
      { query: "x" },
    ]);
  });

  it("maps compact codes back to canonical names", () => {
    expect(journeyEvent("abc~123456:fconf")).toEqual([
      "form-confirmation-view",
      { form: "abc~123456" },
    ]);
  });
});

describe("installClickListener", () => {
  const track = vi.fn<Track>();
  let remove: () => void = () => undefined;

  beforeEach(() => {
    track.mockReset();
    window.umami = { track };
  });

  afterEach(() => {
    remove();
    resetJourneyForTests();
    document.body.innerHTML = "";
    delete (window as { umami?: unknown }).umami;
    vi.unstubAllGlobals();
  });

  // #3502: Umami's script loads with data-auto-track="false", so it never reads
  // data-umami-event itself, and in production /journey is off too.
  it("sends a tagged click to Umami when /journey is not configured", () => {
    remove = installClickListener();
    document.body.innerHTML = `<a data-umami-event="breadcrumb" data-umami-event-to="/money" data-umami-event-depth="2">Money</a>`;
    document.querySelector("a")!.click();
    expect(sentPayload(track)).toMatchObject({
      name: "breadcrumb",
      data: { to: "/money", depth: "2" },
    });
  });

  it("also queues the click for /journey when it is configured", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
    configureJourney({ url: "https://api.example/journey", app: "landing" });
    remove = installClickListener();
    document.body.innerHTML = `<a data-umami-event="helpful-feedback" data-umami-event-path="/money">x</a>`;
    document.querySelector("a")!.click();
    flushJourney();
    const events = JSON.parse(beacon.mock.calls[0][1] as string);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "helpful-feedback",
      props: { path: "/money" },
    });
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("resolves a click on a child to the tagged ancestor", () => {
    remove = installClickListener();
    document.body.innerHTML = `<a data-umami-event="breadcrumb"><span id="inner">Money</span></a>`;
    document.getElementById("inner")!.click();
    expect(sentPayload(track)).toMatchObject({ name: "breadcrumb", data: {} });
  });

  it("ignores untagged elements and an empty event name", () => {
    remove = installClickListener();
    document.body.innerHTML = `<a data-umami-event="" id="empty">x</a><p id="plain">y</p>`;
    document.getElementById("empty")!.click();
    document.getElementById("plain")!.click();
    document.dispatchEvent(new MouseEvent("click"));
    expect(track).not.toHaveBeenCalled();
  });

  // TanStack <Link> skips client-side navigation once defaultPrevented is set,
  // so cancelling the click here would turn every tagged link into a reload.
  it("never cancels the click", () => {
    remove = installClickListener();
    document.body.innerHTML = `<a href="/money" data-umami-event="breadcrumb">x</a>`;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("a")!.dispatchEvent(click);
    expect(track).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(false);
  });

  it("stops sending once removed", () => {
    remove = installClickListener();
    document.body.innerHTML = `<a data-umami-event="breadcrumb">x</a>`;
    remove();
    document.querySelector("a")!.click();
    expect(track).not.toHaveBeenCalled();
  });

  it("does nothing during SSR", () => {
    vi.stubGlobal("document", undefined);
    remove = installClickListener();
    vi.unstubAllGlobals();
    expect(remove).toBeTypeOf("function");
  });
});

describe("UMAMI_SCRIPT_ATTRIBUTES", () => {
  it("keeps Umami's auto-tracking off", () => {
    expect(UMAMI_SCRIPT_ATTRIBUTES["data-auto-track"]).toBe("false");
  });

  // #3503: without it Umami records the full URL, so water alert tokens, search
  // text and forms preview tokens in the query string reach Umami Cloud.
  it("strips the query string from the URLs Umami records", () => {
    expect(UMAMI_SCRIPT_ATTRIBUTES["data-exclude-search"]).toBe("true");
  });
});

describe("dead-end form events fit the 50-char name (#3513)", () => {
  const IDS = [
    "get-birth-certificate",
    "apply-for-temporary-restaurant-permit",
    // The longest real form id in the recipes (84 chars).
    "apply-for-national-summer-camp-programme-tropical-trails-and-tales-science-camp-2026",
  ];

  it.each(["form-closed-view", "form-load-error"])(
    "%s stays within 50 chars and maps back to its name",
    (event) => {
      for (const id of IDS) {
        const name = eventName(id, event);
        expect(name.length).toBeLessThanOrEqual(50);
        expect(canonicalEvent(name.slice(name.indexOf(":") + 1))).toBe(event);
      }
    },
  );
});
