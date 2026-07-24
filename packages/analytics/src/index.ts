import { maskSearchQuery } from "./mask-search-query";

export { maskSearchQuery } from "./mask-search-query";

declare global {
  interface Window {
    umami?: {
      track: (name?: string, data?: Record<string, unknown>) => void;
    };
  }
}

export interface TrackingData {
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
}

export type TrackingEventName = keyof TrackingData;

export function trackEvent<E extends TrackingEventName>(
  event: E,
  data: TrackingData[E],
): void;
export function trackEvent(event: string, data?: Record<string, unknown>): void;
export function trackEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!window.umami) return;
  // Redact PII from a search `query` property before it leaves for the
  // third-party analytics host (#2079). Shallow-copy so the caller's object is
  // untouched. Covers every search event centrally — no call site can forget.
  const safe =
    data && typeof data.query === "string"
      ? { ...data, query: maskSearchQuery(data.query) }
      : data;
  if (
    safe &&
    "form" in safe &&
    typeof safe.form === "string" &&
    !event.includes(":")
  ) {
    window.umami.track(`${safe.form}:${event}`, safe);
  } else if (safe === undefined) {
    window.umami.track(event);
  } else {
    window.umami.track(event, safe);
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

export function trackPageview(): void {
  if (typeof window === "undefined") return;
  window.umami?.track();
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
