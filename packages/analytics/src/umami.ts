/**
 * Sends to Umami with the page the visitor is on now (#3586).
 *
 * Both apps load Umami with data-auto-track="false". Its tracker then reads the
 * URL and referrer once, at load, and never updates them: it only follows
 * pushState when auto-track is on. Left alone, every page view and event in a
 * visit is filed under the entry page. So each send replaces the two fields
 * through track(fn), which Umami calls with the payload it was going to send.
 *
 * url is the pathname only, never location.href: data-exclude-search cleans
 * only the URL the tracker builds itself, and the query can carry tokens
 * (#3503).
 */

export interface UmamiPayload {
  url?: string;
  referrer?: string;
  name?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

// The current page and the path before it. The previous path is undefined on
// the first page view, which keeps the tracker's own (external) referrer, as
// Umami does itself with auto-track on.
let page: { url: string; referrer?: string } | undefined;

/** Record the page view and send it. Recorded even before Umami loads, so the
 *  next page still names this one as its referrer. */
export function sendUmamiPageview(): void {
  const current = { url: location.pathname, referrer: page?.url };
  page = current;
  window.umami?.track((payload) => ({
    ...payload,
    url: current.url,
    referrer: current.referrer ?? payload.referrer,
  }));
}

/** Send an event from the current path, with the referrer of the page view it
 *  happens on (the tracker's own before any page view). */
export function sendUmamiEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  const url = location.pathname;
  const referrer = page?.referrer;
  window.umami?.track((payload) => ({
    ...payload,
    url,
    referrer: referrer ?? payload.referrer,
    name,
    data,
  }));
}
