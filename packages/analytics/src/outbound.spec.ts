import {
  configureJourney,
  flushJourney,
  installOutboundClickListener,
} from "./index";
import { resetJourneyForTests } from "./journey";
import type { Mock } from "vitest";

type Track = NonNullable<Window["umami"]>["track"];

const FORMS = "https://forms.alpha.gov.bb";

describe("installOutboundClickListener", () => {
  const track = vi.fn<Track>();
  let remove: () => void = () => undefined;
  // Whether the listener had cancelled the last click by the time it bubbled
  // up. The click is then cancelled here, as jsdom cannot navigate.
  let cancelled: boolean | undefined;
  const stopNavigation = (e: Event) => {
    cancelled = e.defaultPrevented;
    e.preventDefault();
  };

  beforeEach(() => {
    cancelled = undefined;
    document.addEventListener("click", stopNavigation);
    track.mockReset();
    window.umami = { track };
    window.history.replaceState(null, "", "/register-a-business");
    remove = installOutboundClickListener({ internalOrigins: [FORMS] });
  });

  afterEach(() => {
    document.removeEventListener("click", stopNavigation);
    remove();
    resetJourneyForTests();
    document.body.innerHTML = "";
    delete (window as { umami?: unknown }).umami;
    vi.unstubAllGlobals();
  });

  /** The name and data of every event sent to Umami. */
  function sent(t: Mock<Track> = track) {
    return t.mock.calls.map(([arg]) => {
      if (typeof arg !== "function") throw new Error("track() got no function");
      const { name, data } = arg({});
      return { name, data };
    });
  }

  function link(href: string, attrs = ""): HTMLAnchorElement {
    document.body.innerHTML = `<a href="${href}" ${attrs}><span>Go</span></a>`;
    return document.querySelector("a")!;
  }

  function click(el: Element, init: MouseEventInit = {}, type = "click") {
    el.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
    );
  }

  it("sends the host of an external link, never its path or query string", () => {
    click(
      link("https://www.barbadosparliament.com/bills/list?token=secret#top"),
    );
    expect(sent()).toEqual([
      {
        name: "outbound-click",
        data: {
          kind: "link",
          host: "www.barbadosparliament.com",
          page: "/register-a-business",
        },
      },
    ]);
  });

  it("sends a tel: link without the phone number", () => {
    click(link("tel:+12465364240"));
    expect(sent()).toEqual([
      {
        name: "outbound-click",
        data: { kind: "tel", page: "/register-a-business" },
      },
    ]);
    expect(JSON.stringify(sent())).not.toContain("4240");
  });

  it("sends a mailto: link without the email address", () => {
    click(link("mailto:testing@govtech.bb?subject=Help"));
    expect(sent()).toEqual([
      {
        name: "outbound-click",
        data: { kind: "mailto", page: "/register-a-business" },
      },
    ]);
    expect(JSON.stringify(sent())).not.toMatch(/testing|govtech|Help/);
  });

  it("sends the current path, not the query string, as the page", () => {
    window.history.replaceState(null, "", "/water-alerts?token=abc");
    click(link("https://example.com"));
    expect(sent()[0].data).toMatchObject({ page: "/water-alerts" });
    expect(JSON.stringify(sent())).not.toContain("abc");
  });

  it("resolves a click on a child to its link", () => {
    link("https://example.com");
    click(document.querySelector("span")!);
    expect(sent()).toHaveLength(1);
  });

  it("sends nothing for same-site links", () => {
    click(link("/money"));
    click(link(`${window.location.origin}/money?x=1`));
    click(link("#main"));
    expect(track).not.toHaveBeenCalled();
  });

  it("treats the configured forms origin as the same service", () => {
    click(link(`${FORMS}/forms/get-birth-certificate`));
    click(link(`${FORMS}/`));
    expect(track).not.toHaveBeenCalled();
  });

  it("still counts other subdomains of the forms host", () => {
    click(link("https://chat.alpha.gov.bb/"));
    expect(sent()[0].data).toMatchObject({ host: "chat.alpha.gov.bb" });
  });

  it("sends nothing extra for a link already carrying data-umami-event", () => {
    click(link("https://example.com", 'data-umami-event="related-link"'));
    click(link("tel:123", 'data-umami-event="call"'));
    document.body.innerHTML = `<div data-umami-event="card"><a href="https://example.com">x</a></div>`;
    click(document.querySelector("a")!);
    expect(track).not.toHaveBeenCalled();
  });

  it("ignores clicks that are not on a link, or on links that go nowhere", () => {
    document.body.innerHTML = `<p>text</p><a>no href</a><a href="javascript:void(0)">js</a><a href="sms:123">sms</a>`;
    for (const el of document.body.querySelectorAll("p, a")) click(el);
    document.dispatchEvent(new MouseEvent("click"));
    expect(track).not.toHaveBeenCalled();
  });

  it("ignores a link whose href cannot be parsed", () => {
    click(link("http://["));
    expect(track).not.toHaveBeenCalled();
  });

  // A modified click (Ctrl, Cmd or Shift) opens a new tab or window and still
  // fires click. A middle click fires only auxclick.
  it("counts modified clicks and middle clicks", () => {
    const a = link("https://example.com");
    click(a, { ctrlKey: true });
    click(a, { metaKey: true });
    click(a, { shiftKey: true });
    click(a, { button: 1 }, "auxclick");
    expect(sent()).toHaveLength(4);
  });

  it("counts a middle click once, even where the browser also fires click", () => {
    const a = link("https://example.com");
    click(a, { button: 1 });
    click(a, { button: 1 }, "auxclick");
    expect(sent()).toHaveLength(1);
  });

  it("ignores right clicks, which open a menu rather than the link", () => {
    const a = link("https://example.com");
    click(a, { button: 2 }, "auxclick");
    click(a, { button: 2 });
    expect(track).not.toHaveBeenCalled();
  });

  it("never cancels the click", () => {
    click(link("https://example.com"));
    expect(track).toHaveBeenCalledTimes(1);
    expect(cancelled).toBe(false);
  });

  it("also queues the click for /journey when it is configured", () => {
    const beacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
      writable: true,
    });
    configureJourney({ url: "https://api.example/journey", app: "landing" });
    click(link("mailto:testing@govtech.bb"));
    flushJourney();
    const body = beacon.mock.calls[0][1] as string;
    expect(JSON.parse(body)[0]).toMatchObject({
      event: "outbound-click",
      props: { kind: "mailto", page: "/register-a-business" },
    });
    expect(body).not.toContain("testing");
  });

  it("works with no internal origins, and skips one it cannot parse", () => {
    remove();
    remove = installOutboundClickListener({
      internalOrigins: ["not a url"],
    });
    click(link(`${FORMS}/forms/x`));
    remove();
    remove = installOutboundClickListener();
    click(link(`${FORMS}/forms/x`));
    expect(sent()).toHaveLength(2);
    expect(sent()[0].data).toMatchObject({ host: "forms.alpha.gov.bb" });
  });

  it("stops sending once removed", () => {
    remove();
    const a = link("https://example.com");
    click(a);
    click(a, { button: 1 }, "auxclick");
    expect(track).not.toHaveBeenCalled();
  });

  it("does nothing during SSR", () => {
    vi.stubGlobal("document", undefined);
    const noop = installOutboundClickListener();
    vi.unstubAllGlobals();
    expect(noop).toBeTypeOf("function");
    noop();
  });
});
