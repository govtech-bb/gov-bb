import { format, isValid, parseISO } from "date-fns";

const monthsShort = Array.from({ length: 12 }, (_, month) => format(new Date(2000, month), "MMM"));

/** Parse a stored ISO date as a local day, without UTC conversion. */
export function parseDay(value: unknown): Date | undefined {
  const day = typeof value === "string" ? parseISO(value) : undefined;

  return day && isValid(day) ? day : undefined;
}

/** Store dates as yyyy-MM-dd. */
export const formatDay = (day: Date) => format(day, "yyyy-MM-dd");

/** Compact date display, for example Sep 27, 2026. */
export const shortDate = (day: Date) => format(day, "MMM d, y");

/** Use the question’s date-fns format, or the default abbreviated-month display. */
export const showDate = (day: Date, pattern: string) => format(day, pattern || "MMM d, y");

/** Accept the question’s display format or an ISO date; incomplete input stays undefined. */
export function typedDate(text: string, pattern: string): Date | undefined {
  const parts = pattern ? (pattern.match(/yyyy|MM|dd/g) ?? []) : ["MMM", "dd", "yyyy"];

  const regexp = pattern
    ? pattern
        .replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
        .replace(/yyyy|MM|dd/g, (part) => (part === "yyyy" ? "([0-9]{4})" : "([0-9]{1,2})"))
    : `(${monthsShort.join("|")}) ([0-9]{1,2}), ([0-9]{1,4})`;

  const read = (match: RegExpExecArray | null, order: string[]) => {
    if (!match) return undefined;

    const at = (part: string) =>
      order.includes(part) ? (match[order.indexOf(part) + 1] ?? "") : "";

    const month = order.includes("MMM") ? monthsShort.indexOf(at("MMM")) + 1 : Number(at("MM"));

    return parseDay(
      `${at("yyyy").padStart(4, "0")}-${String(month).padStart(2, "0")}-${at("dd").padStart(2, "0")}`,
    );
  };

  return (
    read(new RegExp(`^${regexp}`).exec(text.trim()), parts) ??
    read(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})/.exec(text.trim()), ["yyyy", "MM", "dd"])
  );
}
