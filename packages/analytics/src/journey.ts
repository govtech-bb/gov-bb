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

export type JourneyApp = "landing" | "forms";
export type JourneyProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  id: string;
  app: JourneyApp;
  event: string;
  props?: JourneyProps;
  path: string;
  page_load_id: string;
  client_ts: string;
}

// Limits mirror apps/api/src/journey/journey-event.schema.ts, so the sender
// never builds an event the server would drop.
const EVENT_NAME = /^[a-z0-9][a-z0-9:~_-]{0,99}$/;
const PROP_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const MAX_PROPS = 20;
const MAX_STRING = 300;
const MAX_PATH = 300;
const MAX_EVENTS_PER_REQUEST = 25;
// The WAF's SizeRestrictions_BODY rule blocks bodies over 8 KB; stay under it.
const MAX_BODY_BYTES = 7_000;
const FLUSH_DELAY_MS = 5_000;

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
    client_ts: new Date().toISOString(),
  });
  if (queue.length >= MAX_EVENTS_PER_REQUEST) flushJourney();
  else if (!timer) timer = setTimeout(flushJourney, FLUSH_DELAY_MS);
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

/**
 * Landing tags clicks with data-umami-event="<name>" plus
 * data-umami-event-<key>="<value>". Umami's script reads those itself; this
 * sends the same clicks as journey events. Returns a function that removes the
 * listener.
 */
export function installJourneyClickListener(): () => void {
  if (typeof document === "undefined" || !config) return () => undefined;
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const el = target?.closest<HTMLElement>("[data-umami-event]");
    if (!el) return;
    const name = el.dataset.umamiEvent;
    if (!name) return;
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(el.dataset)) {
      if (
        key.startsWith("umamiEvent") &&
        key !== "umamiEvent" &&
        value !== undefined
      ) {
        const prop = key.slice("umamiEvent".length);
        props[prop.charAt(0).toLowerCase() + prop.slice(1)] = value;
      }
    }
    sendJourney(name, props);
  };
  document.addEventListener("click", onClick, { capture: true });
  return () =>
    document.removeEventListener("click", onClick, { capture: true });
}

/** For tests: forget configuration and anything queued. */
export function resetJourneyForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  config = null;
  queue = [];
}
