// First-party journey events, sent to the API's POST /journey (apps/api
// src/journey) alongside Umami while the two run side by side. Each event
// becomes one JSON log line on the server; the dashboards are built from those.
//
// Off unless configureJourney() is given a URL. Each site passes
// VITE_JOURNEY_URL, set per environment, so an environment only sends once its
// WAF has a per-IP rule for /journey (alpha-infra #724 for sandbox).
//
// Events are queued and sent in batches with navigator.sendBeacon as
// text/plain: no CORS preflight, and the last batch still goes out when the
// page is closed.
//
// Every event carries a journey_id that lasts for one browser tab (see
// getJourneyId), so landing's Start click, the form and the EzPay round trip
// can be joined. It goes to /journey, and to POST /submissions as the
// X-Journey-Id header (#3507), never to Umami.

export type JourneyApp = "landing" | "forms";
export type JourneyProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  id: string;
  app: JourneyApp;
  event: string;
  props?: JourneyProps;
  path: string;
  page_load_id: string;
  journey_id: string;
  client_ts: string;
}

// Limits mirror apps/api/src/journey/journey-event.schema.ts, so the sender
// never builds an event the server would drop.
const EVENT_NAME = /^[a-z0-9][a-z0-9:~_-]{0,99}$/;
export const PROP_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
export const MAX_PROPS = 20;
const MAX_STRING = 300;
const MAX_PATH = 300;
const MAX_EVENTS_PER_REQUEST = 25;
// The WAF's SizeRestrictions_BODY rule blocks bodies over 8 KB; stay under it.
const MAX_BODY_BYTES = 7_000;
const FLUSH_DELAY_MS = 5_000;
const JOURNEY_ID_KEY = "govbb_journey_id";
// The Start link's query parameter that hands the journey ID to the forms app.
const JOURNEY_ID_PARAM = "jid";
// The API's z.uuid(): version 1-8 and the RFC variant. A looser check would
// let a hand-edited ?jid= through, and the API would drop every event carrying it.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let config: { url: string; app: JourneyApp; pageLoadId: string } | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** Turn journey events on for this page. A missing or empty url leaves them off. */
export function configureJourney(options: {
  url: string | undefined;
  app: JourneyApp;
}): void {
  if (typeof window === "undefined") return;
  const url = options.url?.trim();
  if (!url || typeof crypto?.randomUUID !== "function") return;
  if (config) return;
  config = { url, app: options.app, pageLoadId: crypto.randomUUID() };
  // pagehide covers closing the tab; visibilitychange covers switching away on
  // mobile, where pagehide may never fire.
  window.addEventListener("pagehide", flushJourney);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushJourney();
  });
}

export function journeyEnabled(): boolean {
  return config !== null;
}

/** Queue one event. Invalid names are dropped here rather than by the server. */
export function sendJourney(
  event: string,
  props?: Record<string, unknown>,
): void {
  if (!config) return;
  if (!EVENT_NAME.test(event)) return;
  queue.push({
    id: crypto.randomUUID(),
    app: config.app,
    event,
    props: cleanProps(props),
    // A pathname only: the query string and fragment can carry tokens.
    path: window.location.pathname.slice(0, MAX_PATH),
    page_load_id: config.pageLoadId,
    journey_id: tabJourneyId(config.pageLoadId),
    client_ts: new Date().toISOString(),
  });
  if (queue.length >= MAX_EVENTS_PER_REQUEST) flushJourney();
  else if (!timer) timer = setTimeout(flushJourney, FLUSH_DELAY_MS);
}

/**
 * This tab's journey ID: a random UUID kept in sessionStorage, so it lasts
 * across page loads in one tab (EzPay returns to the same tab) and is gone when
 * the tab closes. Nothing goes in a cookie or localStorage. A new tab starts a
 * new ID; a duplicated tab keeps it, because the browser copies sessionStorage.
 * If storage is blocked, this page load's page_load_id instead. Undefined while
 * journey events are off, so nothing is stored then.
 */
export function getJourneyId(): string | undefined {
  return config ? tabJourneyId(config.pageLoadId) : undefined;
}

function tabJourneyId(pageLoadId: string): string {
  try {
    const stored = sessionStorage.getItem(JOURNEY_ID_KEY);
    if (stored && UUID.test(stored)) return stored;
    const id = crypto.randomUUID();
    sessionStorage.setItem(JOURNEY_ID_KEY, id);
    return id;
  } catch {
    return pageLoadId;
  }
}

/**
 * Add this tab's journey ID to a link into the forms app as ?jid=. The forms
 * app is on another origin, so it can't read this tab's sessionStorage. Call it
 * when the link is clicked: landing pages are server-rendered, and the ID only
 * exists in the browser.
 */
export function withJourneyId(href: string): string {
  const id = getJourneyId();
  if (!id) return href;
  const url = new URL(href, window.location.href);
  url.searchParams.set(JOURNEY_ID_PARAM, id);
  return url.toString();
}

/**
 * Forms boot: keep the journey ID that landing passed in ?jid= for this tab,
 * then remove jid from the address bar. Call it before the router starts, so
 * no page view or logged path ever sees it. jid is removed even when journey
 * events are off or it is not a UUID, so it never stays in a URL people copy.
 */
export function adoptJourneyId(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const jid = url.searchParams.get(JOURNEY_ID_PARAM);
  if (jid === null) return;
  // The link wins over an ID this tab already had on forms: that keeps the
  // landing Start click joined to the form, which is what jid is for.
  if (config && UUID.test(jid)) {
    try {
      sessionStorage.setItem(JOURNEY_ID_KEY, jid.toLowerCase());
    } catch {
      // Storage blocked: getJourneyId falls back to page_load_id.
    }
  }
  url.searchParams.delete(JOURNEY_ID_PARAM);
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
}

/** Send everything queued, split into batches the API and WAF accept. */
export function flushJourney(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!config || queue.length === 0) return;
  const pending = queue;
  queue = [];
  for (const body of batches(pending)) post(config.url, body);
}

function batches(events: QueuedEvent[]): string[] {
  const out: string[] = [];
  let current: QueuedEvent[] = [];
  for (const e of events) {
    const next = [...current, e];
    if (
      current.length > 0 &&
      (next.length > MAX_EVENTS_PER_REQUEST ||
        byteLength(JSON.stringify(next)) > MAX_BODY_BYTES)
    ) {
      out.push(JSON.stringify(current));
      current = [e];
    } else {
      current = next;
    }
  }
  if (current.length > 0) out.push(JSON.stringify(current));
  // A single event over the limit can't be split; the server would never see it.
  return out.filter((b) => byteLength(b) <= MAX_BODY_BYTES);
}

function post(url: string, body: string): void {
  try {
    if (navigator.sendBeacon?.(url, body)) return;
  } catch {
    // fall through to fetch
  }
  // sendBeacon refused (queue full or unsupported). A text/plain no-cors POST
  // is still a simple request, so no preflight; the response is never read.
  void fetch(url, {
    method: "POST",
    body,
    keepalive: true,
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
  }).catch(() => undefined);
}

function cleanProps(props?: Record<string, unknown>): JourneyProps | undefined {
  if (!props) return undefined;
  const out: JourneyProps = {};
  let n = 0;
  for (const [key, value] of Object.entries(props)) {
    if (n >= MAX_PROPS) break;
    if (!PROP_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" && Number.isFinite(value))
      out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else continue;
    n++;
  }
  return n > 0 ? out : undefined;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** For tests: forget configuration and anything queued. */
export function resetJourneyForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  config = null;
  queue = [];
}
