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
    fields: string;
    errorTypes: string;
    /**
     * Field-paired errors: one `fieldId::message` entry per failing
     * validation, joined by ` || `. Unlike `fields`/`errorTypes` (two
     * independent lists), this preserves which message belongs to which
     * field so a report can show them together, un-aggregated.
     */
    fieldErrors: string;
  };
  "page-service-view": { form: string; category: string };
  "page-start-view": { form: string; category: string };
  search: { query: string; results: number };
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
  if (
    data &&
    "form" in data &&
    typeof data.form === "string" &&
    !event.includes(":")
  ) {
    window.umami.track(`${data.form}:${event}`, data);
  } else if (data === undefined) {
    window.umami.track(event);
  } else {
    window.umami.track(event, data);
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
