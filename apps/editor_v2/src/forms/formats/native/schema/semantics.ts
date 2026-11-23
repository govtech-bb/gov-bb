import type { RichText, RichTextInline } from "./types";

/** Compare every property and array position. In particular omission is distinct from false/0/empty. */
function exactEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (left === null || right === null || typeof left !== "object" || typeof right !== "object")
    return false;

  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => exactEqual(item, right[index]))
    );

  const a = Object.keys(left),
    b = Object.keys(right);

  // SAFETY: the guards above exclude null, scalars and arrays; indexed values remain unknown and are compared recursively.
  return (
    a.length === b.length &&
    a.every(
      (key) =>
        Object.hasOwn(right, key) &&
        exactEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}

/** Only text segmentation is canonicalized: adjacent equally marked runs merge, marks form a sorted set, empty text becomes a string, links recurse. */
export function normalizeNativeRichText(value: RichText): RichText {
  if (typeof value === "string") return value;
  const result: RichTextInline[] = [];

  const append = (inline: RichTextInline) => {
    if (typeof inline === "string" && typeof result[result.length - 1] === "string")
      result[result.length - 1] = String(result[result.length - 1]) + inline;
    else if (typeof inline === "object" && "text" in inline) {
      const previous = result.at(-1);

      if (
        previous &&
        typeof previous === "object" &&
        "text" in previous &&
        exactEqual(previous.marks, inline.marks)
      )
        previous.text += inline.text;
      else result.push(inline);
    } else result.push(inline);
  };

  for (const inline of value) {
    if (typeof inline === "string") append(inline);
    else if ("text" in inline) {
      const marks = inline.marks && [...new Set(inline.marks)].sort();

      if (!marks?.length) append(inline.text);
      else append({ text: inline.text, marks });
    } else if ("link" in inline)
      append({ ...inline, content: normalizeNativeRichText(inline.content) });
    else append(structuredClone(inline));
  }

  return !result.length
    ? ""
    : result.length === 1 && typeof result[0] === "string"
      ? result[0]
      : result;
}

function normalizeTextPositions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeTextPositions);

  if (!value || typeof value !== "object") return value;
  // SAFETY: the guards above establish a non-null object; no property value is assumed to have a narrower type.
  const input = value as Record<string, unknown>;

  const result = Object.fromEntries(
    Object.entries(input).map(([key, item]) => [key, normalizeTextPositions(item)]),
  );

  const rich = (key: string) => {
    const field = input[key];

    if (
      typeof field === "string" ||
      (Array.isArray(field) &&
        field.every(
          (item) =>
            typeof item === "string" || (item && typeof item === "object" && !("type" in item)),
        ))
    )
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Compare native text positions without discarding incomplete draft data; import/export owns full rich-text validation.
      result[key] = normalizeNativeRichText(field as RichText);
  };

  if (input.schemaVersion === 2) rich("description");

  if (input.type === "page") {
    rich("title");
    rich("description");
  }

  if (input.type === "question") {
    rich("label");
    rich("hint");

    if (Array.isArray(input.options))
      result.options = input.options.map((option) => ({
        ...option,
        label: normalizeNativeRichText(option.label),
      }));

    if (
      input.kind === "choice" &&
      input.config &&
      typeof input.config === "object" &&
      "groups" in input.config &&
      Array.isArray(input.config.groups)
    )
      result.config = {
        // SAFETY: The config guard above and recursive object mapping preserve this object container.
        ...(result.config as object),
        groups: input.config.groups.map((group) => ({
          ...group,
          label: normalizeNativeRichText(group.label),
        })),
      };
  }

  if (input.type === "content") {
    rich("content");

    if (
      input.kind === "list" &&
      input.config &&
      typeof input.config === "object" &&
      "items" in input.config &&
      Array.isArray(input.config.items)
    )
      result.config = {
        // SAFETY: The config guard above and recursive object mapping preserve this object container.
        ...(result.config as object),
        items: input.config.items.map((item) => ({
          ...item,
          content: normalizeNativeRichText(item.content),
        })),
      };
  }

  if (input.type === "setLabel" || input.type === "setTitle") rich("value");

  return result;
}

export function nativeSemanticEqual(left: unknown, right: unknown): boolean {
  return exactEqual(normalizeTextPositions(left), normalizeTextPositions(right));
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day || month > 12) return false;

  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= days[month - 1]!;
}

export function isTimeOnly(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

export function calendarMonthsBetween(start: string, end: string): number | undefined {
  if (!isDateOnly(start) || !isDateOnly(end)) return undefined;

  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7))
  );
}

export function wholeCalendarYearsBetween(start: string, end: string): number | undefined {
  if (!isDateOnly(start) || !isDateOnly(end) || end < start) return undefined;
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));

  // Lexical month/day comparison places a non-leap February 28 before a February 29 anniversary.
  return years - (end.slice(5) < start.slice(5) ? 1 : 0);
}

export function calendarDaysBetween(start: string, end: string): number | undefined {
  if (!isDateOnly(start) || !isDateOnly(end)) return undefined;

  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}
