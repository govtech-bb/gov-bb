import type { Settings } from "./settings";

export type FieldWidth = "short" | "medium" | "long";

export const FIELD_WIDTHS: [FieldWidth, string][] = [
  ["short", "Short"],
  ["medium", "Medium"],
  ["long", "Long"],
];

export type RelativeDate = "past" | "pastOrToday" | "future" | "futureOrToday";

export const RELATIVE_DATES: [RelativeDate | "", string][] = [
  ["", "Any date"],
  ["past", "In the past"],
  ["pastOrToday", "Today or in the past"],
  ["futureOrToday", "Today or in the future"],
  ["future", "In the future"],
];

export const RELATIVE_DATE_ERRORS: Record<RelativeDate, string> = {
  past: "Today or later",
  pastOrToday: "After today",
  futureOrToday: "Before today",
  future: "Today or earlier",
};

export function relativeDateOf(settings: Settings): RelativeDate | undefined {
  const value = settings.relativeDate;

  return value === "past" ||
    value === "pastOrToday" ||
    value === "future" ||
    value === "futureOrToday"
    ? value
    : undefined;
}

export function patternWorks(pattern: string) {
  if (!pattern) return false;

  try {
    new RegExp(pattern, "u");

    return true;
  } catch {
    return false;
  }
}

export function maskHelp(mask: string) {
  const parts: [string, string][] = [
    ["9", "9 is a digit"],
    ["A", "A is a letter"],
    ["*", "* is a letter or digit"],
  ];

  return (
    "Input mask: " +
    parts.flatMap(([token, text]) => (mask.includes(token) ? [text] : [])).join(", ")
  );
}
