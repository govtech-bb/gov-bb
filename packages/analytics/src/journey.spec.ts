import {
  adoptJourneyId,
  configureJourney,
  flushJourney,
  getJourneyId,
  journeyEnabled,
  resetJourneyForTests,
  sendJourney,
  withJourneyId,
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
    sessionStorage.clear();
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

  describe("journey ID", () => {
    const UUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const LANDING_ID = "6f1c2a4e-8b3d-4c5e-9f60-1a2b3c4d5e6f";
    // UUID-shaped, but the API's z.uuid() rejects it (no version or variant).
    const NOT_RFC_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    // Storage that throws, as when the browser blocks site data.
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };

    function sentEvents(): Record<string, unknown>[] {
      flushJourney();
      return sentBodies(beacon).flat() as Record<string, unknown>[];
    }

    it("is off, and stores nothing, while journey events are off", () => {
      expect(getJourneyId()).toBeUndefined();
      expect(withJourneyId("https://forms.test/forms/x")).toBe(
        "https://forms.test/forms/x",
      );
      expect(sessionStorage.length).toBe(0);
    });

    describe("once configured", () => {
      beforeEach(() => configureJourney({ url: URL_, app: "forms" }));

      it("creates a random UUID once and keeps it for the tab", () => {
        const id = getJourneyId();
        expect(id).toMatch(UUID);
        expect(getJourneyId()).toBe(id);
        expect(sessionStorage.getItem("govbb_journey_id")).toBe(id);
      });

      it("is shared by every event, across page loads in the tab", () => {
        sendJourney("pageview");
        const first = sentEvents()[0];
        // A new page load (the EzPay round trip) in the same tab.
        resetJourneyForTests();
        configureJourney({ url: URL_, app: "forms" });
        sendJourney("pageview");
        const second = sentEvents()[1];
        expect(first.journey_id).toMatch(UUID);
        expect(second.journey_id).toBe(first.journey_id);
        expect(second.page_load_id).not.toBe(first.page_load_id);
      });

      it("is new in a new tab", () => {
        const id = getJourneyId();
        // A new tab starts with empty sessionStorage.
        sessionStorage.clear();
        expect(getJourneyId()).toMatch(UUID);
        expect(getJourneyId()).not.toBe(id);
      });

      it.each(["not-a-uuid", NOT_RFC_UUID])(
        "replaces a stored value the API would reject: %s",
        (stored) => {
          sessionStorage.setItem("govbb_journey_id", stored);
          expect(getJourneyId()).toMatch(UUID);
          expect(getJourneyId()).not.toBe(stored);
        },
      );

      it("falls back to page_load_id when storage is blocked", () => {
        vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked });
        sendJourney("pageview");
        const [e] = sentEvents();
        expect(e.journey_id).toBe(e.page_load_id);
      });

      it("writes nothing to cookies or localStorage", () => {
        const local = {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
        };
        vi.stubGlobal("localStorage", local);
        window.history.replaceState({}, "", `/forms/x?jid=${LANDING_ID}`);
        adoptJourneyId();
        getJourneyId();
        withJourneyId("https://forms.test/forms/x");
        sendJourney("pageview");
        flushJourney();
        expect(document.cookie).toBe("");
        for (const fn of Object.values(local))
          expect(fn).not.toHaveBeenCalled();
      });

      it("adds the ID to a link as ?jid=, keeping its other params", () => {
        const id = getJourneyId();
        expect(withJourneyId("https://forms.test/forms/x?a=1#top")).toBe(
          `https://forms.test/forms/x?a=1&jid=${id}#top`,
        );
        // Clicking the same link twice must not add it twice.
        expect(withJourneyId(withJourneyId("https://forms.test/forms/x"))).toBe(
          `https://forms.test/forms/x?jid=${id}`,
        );
      });
    });

    describe("adoptJourneyId", () => {
      it("keeps the ID from ?jid= and strips it from the address bar", () => {
        configureJourney({ url: URL_, app: "forms" });
        window.history.replaceState(
          { key: "k" },
          "",
          `/forms/x?preview=p&jid=${LANDING_ID.toUpperCase()}#main`,
        );
        adoptJourneyId();
        expect(window.location.pathname).toBe("/forms/x");
        expect(window.location.search).toBe("?preview=p");
        expect(window.location.hash).toBe("#main");
        expect(window.history.state).toEqual({ key: "k" });
        expect(getJourneyId()).toBe(LANDING_ID);
      });

      it("never puts jid in a logged path", () => {
        configureJourney({ url: URL_, app: "forms" });
        window.history.replaceState({}, "", `/forms/x?jid=${LANDING_ID}`);
        sendJourney("pageview");
        adoptJourneyId();
        sendJourney("pageview");
        for (const e of sentEvents()) {
          expect(e.path).toBe("/forms/x");
          expect(JSON.stringify(e)).not.toContain("jid");
        }
      });

      it("strips jid without keeping it when journey events are off", () => {
        window.history.replaceState({}, "", `/forms/x?jid=${LANDING_ID}`);
        adoptJourneyId();
        expect(window.location.search).toBe("");
        expect(sessionStorage.length).toBe(0);
      });

      it.each(["<script>", NOT_RFC_UUID])(
        "strips a jid the API would reject without keeping it: %s",
        (jid) => {
          configureJourney({ url: URL_, app: "forms" });
          window.history.replaceState({}, "", `/forms/x?jid=${jid}`);
          adoptJourneyId();
          expect(window.location.search).toBe("");
          expect(sessionStorage.length).toBe(0);
        },
      );

      it("still strips jid when storage is blocked", () => {
        configureJourney({ url: URL_, app: "forms" });
        vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked });
        window.history.replaceState({}, "", `/forms/x?jid=${LANDING_ID}`);
        adoptJourneyId();
        expect(window.location.search).toBe("");
      });

      it("leaves a URL without jid alone", () => {
        window.history.replaceState({}, "", "/forms/x?step=two");
        const replace = vi.spyOn(window.history, "replaceState");
        adoptJourneyId();
        expect(replace).not.toHaveBeenCalled();
      });

      it("does nothing during SSR", () => {
        vi.stubGlobal("window", undefined);
        expect(() => adoptJourneyId()).not.toThrow();
      });
    });
  });
});
