import {
  configureJourney,
  flushJourney,
  installJourneyClickListener,
  journeyEnabled,
  resetJourneyForTests,
  sendJourney,
} from "./journey";

const URL_ = "https://forms.api.sandbox.alpha.gov.bb/journey";

function sentBodies(beacon: ReturnType<typeof vi.fn>): unknown[][] {
  return beacon.mock.calls.map((c) => JSON.parse(c[1] as string));
}

describe("journey events", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    resetJourneyForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("configureJourney", () => {
    it("stays off without a url", () => {
      configureJourney({ url: undefined, app: "landing" });
      configureJourney({ url: "   ", app: "landing" });
      expect(journeyEnabled()).toBe(false);
      sendJourney("pageview");
      flushJourney();
      expect(beacon).not.toHaveBeenCalled();
    });

    it("stays off during SSR", () => {
      vi.stubGlobal("window", undefined);
      configureJourney({ url: URL_, app: "landing" });
      vi.unstubAllGlobals();
      expect(journeyEnabled()).toBe(false);
    });

    it("stays off where crypto.randomUUID is missing", () => {
      vi.stubGlobal("crypto", {});
      configureJourney({ url: URL_, app: "landing" });
      expect(journeyEnabled()).toBe(false);
    });

    it("keeps the first configuration", () => {
      configureJourney({ url: URL_, app: "landing" });
      configureJourney({ url: "https://other.example/journey", app: "forms" });
      sendJourney("pageview");
      flushJourney();
      expect(beacon.mock.calls[0][0]).toBe(URL_);
      expect(sentBodies(beacon)[0][0]).toMatchObject({ app: "landing" });
    });
  });

  describe("sendJourney", () => {
    beforeEach(() => configureJourney({ url: URL_, app: "forms" }));

    it("builds an event the API schema accepts", () => {
      window.history.pushState(
        {},
        "",
        "/forms/get-birth-certificate?token=secret#x",
      );
      sendJourney("form-start", {
        form: "get-birth-certificate",
        category: "family",
      });
      flushJourney();
      const [e] = sentBodies(beacon)[0] as Record<string, unknown>[];
      expect(e).toMatchObject({
        app: "forms",
        event: "form-start",
        path: "/forms/get-birth-certificate",
        props: { form: "get-birth-certificate", category: "family" },
      });
      expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(e.page_load_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Date(e.client_ts as string).toISOString()).toBe(e.client_ts);
    });

    it("uses one page_load_id per page and a new id per event", () => {
      sendJourney("pageview");
      sendJourney("pageview");
      flushJourney();
      const [a, b] = sentBodies(beacon)[0] as Record<string, unknown>[];
      expect(a.page_load_id).toBe(b.page_load_id);
      expect(a.id).not.toBe(b.id);
    });

    it("drops names the server would reject", () => {
      sendJourney("Bad Name");
      sendJourney("");
      flushJourney();
      expect(beacon).not.toHaveBeenCalled();
    });

    it("keeps only props the server accepts", () => {
      const many = Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [`k${i}`, i]),
      );
      sendJourney("search", {
        query: "x".repeat(400),
        ok: true,
        "bad key": "x",
        nested: { a: 1 },
        notFinite: Number.NaN,
        nothing: undefined,
      });
      sendJourney("search", many);
      sendJourney("search", { "bad key": "only" });
      sendJourney("search");
      flushJourney();
      const [a, b, c, d] = sentBodies(beacon)[0] as Record<string, unknown>[];
      expect(a.props).toEqual({ query: "x".repeat(300), ok: true });
      expect(Object.keys(b.props as object)).toHaveLength(20);
      expect(c.props).toBeUndefined();
      expect(d.props).toBeUndefined();
    });

    it("sends after a short delay, once", () => {
      sendJourney("pageview");
      sendJourney("search");
      expect(beacon).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5_000);
      expect(beacon).toHaveBeenCalledTimes(1);
      expect(sentBodies(beacon)[0]).toHaveLength(2);
    });

    it("sends straight away at 25 events", () => {
      for (let i = 0; i < 25; i++) sendJourney("pageview");
      expect(beacon).toHaveBeenCalledTimes(1);
      expect(sentBodies(beacon)[0]).toHaveLength(25);
    });

    it("sends on pagehide and when the page is hidden, not when shown", () => {
      sendJourney("pageview");
      window.dispatchEvent(new Event("pagehide"));
      expect(beacon).toHaveBeenCalledTimes(1);

      sendJourney("pageview");
      const state = vi.spyOn(document, "visibilityState", "get");
      state.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(beacon).toHaveBeenCalledTimes(1);
      state.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(beacon).toHaveBeenCalledTimes(2);
    });

    it("splits batches to stay under the WAF's 8 KB body limit", () => {
      for (let i = 0; i < 24; i++)
        sendJourney("search", { query: "q".repeat(290) });
      flushJourney();
      expect(beacon.mock.calls.length).toBeGreaterThan(1);
      for (const [, body] of beacon.mock.calls) {
        expect(
          new TextEncoder().encode(body as string).length,
        ).toBeLessThanOrEqual(7_000);
      }
      expect(sentBodies(beacon).flat()).toHaveLength(24);
    });

    it("drops a single event too big to send", () => {
      const huge = Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`k${i}`, "é".repeat(300)]),
      );
      sendJourney("search", huge);
      flushJourney();
      expect(beacon).not.toHaveBeenCalled();
    });

    it("falls back to fetch when sendBeacon refuses or throws", async () => {
      const fetchMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("fetch", fetchMock);
      beacon.mockReturnValueOnce(false);
      sendJourney("pageview");
      flushJourney();
      beacon.mockImplementationOnce(() => {
        throw new Error("blocked");
      });
      sendJourney("pageview");
      flushJourney();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        method: "POST",
        keepalive: true,
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
      });
    });

    it("falls back to fetch without sendBeacon and ignores a failed fetch", async () => {
      Object.defineProperty(navigator, "sendBeacon", {
        value: undefined,
        configurable: true,
        writable: true,
      });
      const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
      vi.stubGlobal("fetch", fetchMock);
      sendJourney("pageview");
      expect(() => flushJourney()).not.toThrow();
      await Promise.resolve();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does nothing when flushed with an empty queue", () => {
      flushJourney();
      expect(beacon).not.toHaveBeenCalled();
    });
  });

  describe("installJourneyClickListener", () => {
    it("does nothing while journey events are off", () => {
      const remove = installJourneyClickListener();
      expect(remove).toBeTypeOf("function");
      remove();
    });

    it("does nothing during SSR", () => {
      configureJourney({ url: URL_, app: "landing" });
      vi.stubGlobal("document", undefined);
      const remove = installJourneyClickListener();
      vi.unstubAllGlobals();
      remove();
    });

    it("sends data-umami-event clicks with their data-umami-event-* props", () => {
      configureJourney({ url: URL_, app: "landing" });
      const remove = installJourneyClickListener();
      document.body.innerHTML = `
        <a data-umami-event="breadcrumb" data-umami-event-to="/money" data-umami-event-depth="2"><span id="inner">Money</span></a>
        <a data-umami-event="" id="empty">x</a>
        <p id="plain">y</p>`;
      document.getElementById("inner")!.click();
      document.getElementById("empty")!.click();
      document.getElementById("plain")!.click();
      document.dispatchEvent(new MouseEvent("click"));
      flushJourney();
      const events = sentBodies(beacon)[0] as Record<string, unknown>[];
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: "breadcrumb",
        props: { to: "/money", depth: "2" },
      });

      remove();
      document.getElementById("inner")!.click();
      flushJourney();
      expect(beacon).toHaveBeenCalledTimes(1);
    });
  });
});
