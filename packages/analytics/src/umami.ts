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

// The page of the last page view: its path, and the path before it. The
// previous path is undefined on the first page, which keeps the tracker's own
// (external) referrer, as Umami does itself with auto-track on.
type Page = { url: string; referrer?: string };

let page: Page | undefined;

// The page the visitor is on now. The same path is the same page: forms sends
// a page view on every ?step= change, and Umami itself only counts a new page
// when the path changes. A new path names the last page view as its referrer.
function currentPage(): Page {
  const url = location.pathname;
  return url === page?.url ? page : { url, referrer: page?.url };
}

function send(
  current: Page,
  event?: { name: string; data?: Record<string, unknown> },
): void {
  window.umami?.track((payload) => ({
    ...payload,
    ...event,
    url: current.url,
    referrer: current.referrer ?? payload.referrer,
  }));
}

/** Record the page view and send it. Recorded even before Umami loads, so the
 *  next page still names this one as its referrer. */
export function sendUmamiPageview(): void {
  page = currentPage();
  send(page);
}

/** Send an event from the current path, with that page's referrer. */
export function sendUmamiEvent(
  name: string,
  data?: Record<string, unknown>,
): void {
  send(currentPage(), { name, data });
}
