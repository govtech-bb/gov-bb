import { maskSearchQuery } from "./mask-search-query";
import { journeyEnabled, sendJourney } from "./journey";
import { sendUmamiEvent, sendUmamiPageview, type UmamiPayload } from "./umami";
import type { ToolTrackingData } from "./tool-events";

export { maskSearchQuery } from "./mask-search-query";
export {
  configureJourney,
  flushJourney,
  journeyEnabled,
  sendJourney,
} from "./journey";
export { adoptJourneyId, getJourneyId, withJourneyId } from "./journey";
export type {
  ToolId,
  ToolResult,
  ToolResultData,
  ToolTrackingData,
} from "./tool-events";

declare global {
  interface Window {
    umami?: {
      track: (
        name?: string | ((payload: UmamiPayload) => UmamiPayload),
        data?: Record<string, unknown>,
      ) => void;
    };
  }
}

/**
 * Attributes every app puts on its Umami <script> tag, besides the website id.
 * - data-auto-track="false": page views come from each app's router, and
 *   Umami's own click handler stays off, because it cancels data-umami-event
 *   link clicks and reloads the page (#3502).
 * - data-exclude-search="true": Umami records URLs without the query string,
 *   which can hold water alert tokens, search text and forms preview tokens
 *   (#3503).
 */
export const UMAMI_SCRIPT_ATTRIBUTES = {
  "data-auto-track": "false",
  "data-exclude-search": "true",
} as const;

// Landing tool events (tool-step-view, tool-result, tool-action, tool-error)
// are in tool-events.ts (ADR 0079).
export interface TrackingData extends ToolTrackingData {
  "form-start": { form: string; category: string };
  "form-step-back": { form: string; category: string; step: string };
  "form-step-edit": { form: string; category: string; step: string };
  "form-step-view": { form: string; category: string; step: string };
  "form-file-select": {
    form: string;
    category: string;
    step: string;
    field: string;
    mime: string;
    size_kb: number;
  };
  "form-submit": { form: string; category: string; duration_seconds: number };
  "form-submit-error": { form: string; category: string; errors: string };
  "form-review": { form: string; category: string; duration_seconds: number };
  "form-validation-error": {
    form: string;
    category: string;
    step: string;
    errorCount: number;
    /**
     * Per-field failure reasons, encoded as
     * `field:code[|code];field:code…` — see buildValidationErrorPayload. Pairs
     * each field id with the stable reason code(s) it failed on, so the
     * dashboard can link fields to reasons and count multiple reasons per field.
     */
    fieldErrors: string;
  };
  "page-service-view": { form: string; category: string };
  "page-start-view": { form: string; category: string };
  /** Citizen clicked "Continue to payment" on the confirmation page (#1955). */
  "payment-initiated": { form: string; category: string; amount: string };
  /**
   * Citizen returned from EzPay to the confirmation page (#1955). `outcome` is
   * "success" | "failed" (from the `?payment=` return param folded into state).
   */
  "payment-returned": { form: string; category: string; outcome: string };
  /**
   * Confirmation page viewed (#1955) — the true end of the journey. `outcome`
   * distinguishes success / failed / processing / payment states; `hasPayment`
   * segments payment vs non-payment forms.
   */
  "form-confirmation-view": {
    form: string;
    category: string;
    outcome: string;
    hasPayment: boolean;
  };
  search: { query: string; results: number };
  "search-result-click": { query: string; position: number; href: string };
  "search-no-results": { query: string };
  // Dead ends (#3513): where a citizen was stopped before reaching a service.
  "form-closed-view": { form: string };
  /** `form` is absent on a route outside a form, and when the form is not found. */
  "form-load-error": {
    form?: string;
    reason: "not-found" | "network" | "server";
  };
  "service-unavailable-view": Record<string, never>;
  /** The app only, never the path, in the event data: a missing page's address
   *  can hold typed text. */
  "page-not-found": { app: string };
  // Chat (#3515). Never the question or answer text.
  /**
   * A question asked. `source` is where: a landing placement such as "home",
   * or "chat" when typed in the chat app.
   */
  "chat-submit": { source: string };
  /**
   * The chat app's reply to one question. `source` is where it was asked:
   * "chat" (typed there; the chat app sent chat-submit) or "landing" (carried
   * over in `?q=`; landing sent chat-submit or chat-suggestion). `cited` is
   * true when the reply came with cited alpha.gov.bb pages.
   */
  "chat-answer": {
    outcome: "answered" | "error" | "stopped";
    source: "chat" | "landing";
    cited: boolean;
  };
}

export type TrackingEventName = keyof TrackingData;

export function trackEvent<E extends TrackingEventName>(
  event: E,
  data: TrackingData[E],
): void;
// Any other name. A tool event name is refused here, so wrong tool data fails
// type-check instead of falling through to this overload (ADR 0079).
export function trackEvent<N extends string>(
  event: N extends keyof ToolTrackingData ? never : N,
  data?: Record<string, unknown>,
): void;
export function trackEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!window.umami && !journeyEnabled()) return;
  // Redact PII from a search `query` property before it leaves for the
  // third-party analytics host (#2079). Shallow-copy so the caller's object is
  // untouched. Covers every search event centrally — no call site can forget.
  const safe =
    data && typeof data.query === "string"
      ? { ...data, query: maskSearchQuery(data.query) }
      : data;
  sendJourney(...journeyEvent(event, safe));
  if (!window.umami) return;
  if (
    safe &&
    "form" in safe &&
    typeof safe.form === "string" &&
    !event.includes(":")
  ) {
    sendUmamiEvent(eventName(safe.form, event), safe);
  } else {
    sendUmamiEvent(event, safe);
  }
}

const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** Converts a 1-based step number to a word ("one"–"ten"), falling back to the digit. */
export function stepNumberToWord(n: number): string {
  return NUMBER_WORDS[n - 1] ?? String(n);
}

// --- Event-name length safety (#2682) --------------------------------------
//
// Umami truncates event names at 50 characters. Names are `<formId>:<event>`,
// so a form with a long id (e.g. `apply-for-temporary-restaurant-permit`, 37
// chars) overflows on the longer suffixes: `…:form-step-view` (52),
// `…:form-confirmation-view` (60), `…:form-validation-error` (59). Umami stores
// the truncated name (`…:form-step-vi`), but the dashboard queries the full
// name — so those events are counted yet their per-step / confirmation /
// validation breakdowns silently read zero, and long-id per-step names can even
// collide into one bucket.
//
// To stay within the limit AND keep each event distinct:
//  - an overflowing event suffix falls back to a compact code (≤5 chars);
//  - a form id that is itself too long (>44, so even `<id>:<code>` overflows) is
//    shortened to a stable `<prefix>~<hash>` key — unique and deterministic, so
//    emission and the dashboard derive the same key from the id.
// Short-id forms are unaffected (their full names already fit). Emission
// (trackEvent / stepCompleteEventName) and the dashboard's queries/aggregation
// MUST all route through eventName() / eventFormKey() / canonicalEvent() /
// stepFromEvent() so both sides agree.

export const MAX_EVENT_NAME_LENGTH = 50;

// Longest compact suffix is 5 chars (`fstrt`, `fconf`, …), so capping the form
// key at 44 keeps `<key>:<code>` ≤ 50 for every event of a given form — a single
// stable key per form, independent of which event it is.
const MAX_FORM_KEY = MAX_EVENT_NAME_LENGTH - 1 - 5;

/** Canonical event suffix → compact code, applied only when the full
 *  `<formId>:<event>` name would exceed the 50-char limit. Per-step events
 *  (`form-step-<n>`) are coded dynamically (`s<n>`) to cover any step count. */
export const SHORT_EVENT: Readonly<Record<string, string>> = {
  "form-start": "fstrt",
  "form-step-view": "sview",
  "form-step-back": "sback",
  "form-step-edit": "sedit",
  "form-file-select": "ffsel",
  "form-submit": "fsub",
  "form-submit-error": "fsube",
  "form-review": "frev",
  "form-validation-error": "fverr",
  "form-confirmation-view": "fconf",
  "page-service-view": "psvw",
  "page-start-view": "pstvw",
  "payment-initiated": "pinit",
  "payment-returned": "pretn",
  "form-closed-view": "fclsd",
  "form-load-error": "flerr",
};

const CANONICAL_BY_SHORT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SHORT_EVENT).map(([canonical, short]) => [short, canonical]),
);

/** FNV-1a → 6 base36 chars. Deterministic and dependency-free, so the browser
 *  (emission) and the server (dashboard) hash a form id identically. */
function hash6(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

/** The 1-based step number a `form-step-<suffix>` carries (word `one`–`ten` or a
 *  bare number for step 11+), or null if the suffix is not a step. */
function stepNumberOf(suffix: string): number | null {
  const word = NUMBER_WORDS.indexOf(suffix as (typeof NUMBER_WORDS)[number]);
  if (word !== -1) return word + 1;
  return /^\d+$/.test(suffix) ? Number(suffix) : null;
}

/** The compact suffix for an event: `s<n>` for any per-step event, else the
 *  SHORT_EVENT code, else the event unchanged (defensive — all tracked events
 *  are mapped). */
function shortSuffix(event: string): string {
  const step = /^form-step-(.+)$/.exec(event);
  if (step) {
    const n = stepNumberOf(step[1]);
    if (n !== null) return `s${n}`;
  }
  return SHORT_EVENT[event] ?? event;
}

/** The form-id portion of an event name: the id itself when ≤44 chars (history
 *  preserved), else a stable `<prefix>~<hash>` key so a very long id still fits.
 *  Emission and dashboard both derive the key from the id, so no reverse map is
 *  needed for per-form queries. */
export function eventFormKey(formId: string): string {
  return formId.length <= MAX_FORM_KEY
    ? formId
    : `${formId.slice(0, MAX_FORM_KEY - 7)}~${hash6(formId)}`;
}

/**
 * Build the Umami event name for a per-form event, guaranteed within the 50-char
 * limit. Full `<formId>:<event>` when it fits (unchanged history for short-id
 * forms); otherwise `<key>:<compact-code>`, where the key is the id or its hashed
 * form for ids > 44 chars.
 */
export function eventName(formId: string, event: string): string {
  const full = `${formId}:${event}`;
  if (full.length <= MAX_EVENT_NAME_LENGTH) return full;
  const name = `${eventFormKey(formId)}:${shortSuffix(event)}`;
  // Reachable only for an unmapped event on a >44-char id; mapped events always fit.
  return name.length <= MAX_EVENT_NAME_LENGTH
    ? name
    : name.slice(0, MAX_EVENT_NAME_LENGTH);
}

/** Map a stored event suffix back to its canonical name (compact code → long);
 *  a name that is already canonical (or unknown) is returned unchanged. For the
 *  dashboard aggregating raw Umami event names. */
export function canonicalEvent(event: string): string {
  return CANONICAL_BY_SHORT[event] ?? event;
}

/** The 1-based step number an event suffix represents, or null if it is not a
 *  per-step event. Handles the full `form-step-<word>` and `form-step-<n>` names
 *  (short-id forms, any step count) and the `s<n>` compact codes (long-id forms). */
export function stepFromEvent(event: string): number | null {
  const short = /^s(\d+)$/.exec(event);
  if (short) return Number(short[1]);
  const step = /^form-step-(.+)$/.exec(event);
  return step ? stepNumberOf(step[1]) : null;
}

export function trackPageview(): void {
  if (typeof window === "undefined") return;
  sendJourney("pageview");
  sendUmamiPageview();
}

/**
 * Landing tags clicks with data-umami-event="<name>" plus
 * data-umami-event-<key>="<value>". This sends each one through trackEvent,
 * so it reaches Umami and /journey alike. Umami's own handler for these
 * attributes stays off (data-auto-track="false"): it cancels the click and
 * reloads the page, which breaks TanStack <Link> navigation (#3502). So this
 * listener must never call preventDefault. Prop keys arrive in camelCase, as
 * dataset gives them (data-umami-event-form-id becomes formId), because
 * /journey rejects hyphens in prop keys. Name a form id prop formId, never form:
 * trackEvent packs the event name as <form>:<event> when it sees a form prop.
 * Returns a function that removes it.
 */
export function installClickListener(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const el = target?.closest<HTMLElement>("[data-umami-event]");
    const name = el?.dataset.umamiEvent;
    if (!el || !name) return;
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
    trackEvent(name, props);
  };
  document.addEventListener("click", onClick, { capture: true });
  return () =>
    document.removeEventListener("click", onClick, { capture: true });
}

/**
 * Journey events carry the plain event name with the form as a prop, not
 * Umami's packed `<formId>:<event>` (which exists only for Umami's 50-character
 * name limit). A packed name from a call site such as stepCompleteEventName is
 * unpacked here: compact codes map back to canonical names and `s<n>` back to
 * `form-step-<word>`.
 */
export function journeyEvent(
  event: string,
  data?: Record<string, unknown>,
): [string, Record<string, unknown> | undefined] {
  const sep = event.indexOf(":");
  if (sep === -1) return [event, data];
  const key = event.slice(0, sep);
  const suffix = event.slice(sep + 1);
  const step = stepFromEvent(suffix);
  const name =
    step !== null
      ? `form-step-${stepNumberToWord(step)}`
      : canonicalEvent(suffix);
  const form = typeof data?.form === "string" ? data.form : key;
  return [name, { ...data, form }];
}

export function deriveStartEventName(href: string): string {
  // Trim leading/trailing slashes with index walks rather than a regex —
  // `/^\/+|\/+$/g` is a polynomial-ReDoS pattern (js/polynomial-redos) on
  // inputs with many repeated slashes.
  let start = 0;
  let end = href.length;
  while (start < end && href[start] === "/") start++;
  while (end > start && href[end - 1] === "/") end--;
  const trimmed = href.slice(start, end);
  const withoutStart = trimmed.replace(/\/start$/, "");
  const slug = withoutStart.replace(/\//g, "-");
  return `${slug}-start`;
}
