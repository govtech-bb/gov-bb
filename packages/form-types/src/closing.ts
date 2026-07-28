// Application-deadline helpers (#1936). Single-sourced here so apps/api,
// apps/forms, and apps/landing all agree on when a form is closed and how the
// closing time is displayed.

/**
 * Whether a form's application window has closed. A form with no
 * `closingDateTime` is never closed. Comparison is on the absolute instant, so
 * it is timezone-safe regardless of the offset in the stored string. An
 * unparseable value is treated as "not closed" (fail open — never trap a
 * citizen out of a form because of a malformed date).
 */
export function isFormClosed(
  closingDateTime: string | undefined,
  now: Date,
): boolean {
  if (!closingDateTime) return false;
  const closesAt = new Date(closingDateTime).getTime();
  if (Number.isNaN(closesAt)) return false;
  return now.getTime() >= closesAt;
}

/**
 * Format a closing datetime as e.g. "Thursday, 9 July 2026 at 11:59pm" — the
 * Barbados wall-clock (AST, no DST), lowercase am/pm with no space, matching
 * the "Applications have closed" design.
 */
export function formatClosingDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Barbados",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const period = get("dayPeriod").toLowerCase().replace(/\s/g, "");
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} at ${get("hour")}:${get("minute")}${period}`;
}
