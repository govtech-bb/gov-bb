import { trackEvent, type TrackingData } from "./index";

/**
 * Counts clicks on links that leave the service: another site, a tel: link or
 * a mailto: link (#3512). Many information pages succeed when a citizen
 * follows one of these, and nothing else records it.
 *
 * Each click sends `outbound-click` with the kind of link, the host for a web
 * link and the current path. It never sends the full URL, the query string,
 * the phone number or the email address.
 *
 * Not outbound: links to this site's own origin, links to `internalOrigins`
 * (landing passes the forms origin, as landing and forms are one service),
 * and clicks inside a data-umami-event element, which installClickListener
 * already sends.
 *
 * A left click, with or without Ctrl, Cmd or Shift, fires click. A middle
 * click opens a new tab and fires only auxclick. A right click also fires
 * auxclick, but opens a menu, so it is not counted. Each listener takes only
 * its own button, so one gesture is counted once even where a browser fires
 * both events. The listener never cancels the click. Returns a function that
 * removes it.
 */
export function installOutboundClickListener(
  options: { internalOrigins?: readonly string[] } = {},
): () => void {
  if (typeof document === "undefined") return () => undefined;
  const internal = new Set(
    (options.internalOrigins ?? []).map((o) => parseUrl(o)?.origin),
  );
  const onClick = (e: MouseEvent) => {
    if (e.button !== (e.type === "auxclick" ? 1 : 0)) return;
    const target = e.target instanceof Element ? e.target : null;
    // installClickListener sends this click: same test it uses.
    if (
      target?.closest<HTMLElement>("[data-umami-event]")?.dataset.umamiEvent
    ) {
      return;
    }
    const link = target?.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const data = outboundData(link.href, internal);
    if (data) trackEvent("outbound-click", data);
  };
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("auxclick", onClick, { capture: true });
  return () => {
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("auxclick", onClick, { capture: true });
  };
}

function outboundData(
  href: string,
  internal: ReadonlySet<string | undefined>,
): TrackingData["outbound-click"] | null {
  const url = parseUrl(href);
  if (!url) return null;
  const page = window.location.pathname;
  if (url.protocol === "tel:") return { kind: "tel", page };
  if (url.protocol === "mailto:") return { kind: "mailto", page };
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin === window.location.origin || internal.has(url.origin)) {
    return null;
  }
  return { kind: "link", host: url.hostname, page };
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}
