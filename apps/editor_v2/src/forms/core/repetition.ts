import type { Setting, Settings } from "./settings";

export type Repeatable = {
  min: number;
  max: number;
  addAnotherLabel?: string;
  instanceLabel?: string;
};

export type FieldArray = { min: number; max: number; addAnotherLabel?: string };

export type RepeatableBehaviour = { type: "repeatable" } & Repeatable;

export type FieldArrayBehaviour = { type: "fieldArray" } & FieldArray;

export const toSettings = (value: Repeatable | undefined) =>
  value === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(value).filter(([, value]) => value !== undefined && value !== ""),
      );

/** A page's repeat, for its settings popover: `question` is what SSB will ask (the author's, else auto). */
export type PageRepeat = { value?: Repeatable; question: string };

/** What SSB adds at the end of a repeating page: a caption, and its question while people can still add an entry. */
export type RepeatEnd = { caption: string; question?: string };

/** A repeated answer as drawn: one legend per drawn entry (the first is the editable box's), Remove, the button. */
export type FieldArrayDrawing = { legends: string[]; remove: boolean; add?: string };

export const DEFAULT_REPEATABLE = { min: 1, max: 5 };

export const DEFAULT_FIELD_ARRAY = { min: 1, max: 4 };

export const MAX_ENTRIES = 500;

function readRepeat(value: Setting | undefined, page: boolean): Repeatable | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof value.min !== "number" ||
    !Number.isFinite(value.min) ||
    typeof value.max !== "number" ||
    !Number.isFinite(value.max)
  )
    return;
  const min = Math.max(1, Math.floor(value.min));

  return {
    min,
    max: Math.max(min, Math.floor(value.max)),
    ...(typeof value.addAnotherLabel === "string" &&
      value.addAnotherLabel.trim() && { addAnotherLabel: value.addAnotherLabel }),
    ...(page &&
      typeof value.instanceLabel === "string" &&
      value.instanceLabel.trim() && { instanceLabel: value.instanceLabel }),
  };
}

export const repeatableOf = (settings: Settings) => readRepeat(settings.repeatable, true);

export const fieldArrayOf = (settings: Settings): FieldArray | undefined =>
  readRepeat(settings.fieldArray, false);

export function withText(
  value: Repeatable,
  key: "addAnotherLabel" | "instanceLabel",
  text: string,
) {
  const next = { ...value };

  if (text.trim()) next[key] = text;
  else delete next[key];

  return next;
}

// SSB's validate-date.ts asPhrase: retain initials such as NIS when a label goes mid-sentence.
export const phrase = (label: string) =>
  label
    .trim()
    .replace(/[?:]$/, "")
    .trim()
    .replace(/^[A-Z][a-z]/, (start) => start[0]!.toLowerCase() + start[1]);

export const autoQuestion = (instanceLabel?: string) =>
  instanceLabel?.trim() ? `Do you need to add another ${phrase(instanceLabel)}?` : "Add another?";

export const autoAddAnother = (label: string) =>
  !label.trim() || label.trim().endsWith("?") ? "Add another" : `Add another ${phrase(label)}`;

export const instanceMarker = (value: Repeatable, n: number) =>
  value.instanceLabel ? `${value.instanceLabel} ${n}` : `${n}`;

export const entriesText = ({ min, max }: FieldArray) =>
  min === max
    ? `${min} ${min === 1 ? "entry" : "entries"}`
    : min === 1
      ? `up to ${max} entries`
      : `${min} to ${max} entries`;

export const repeatSummary = (value: Repeatable) =>
  `Repeats · ${entriesText(value)}${value.instanceLabel ? ` · ${value.instanceLabel}` : ""}`;

export function boundsError(min: number, max: number) {
  if (!Number.isInteger(min) || !Number.isInteger(max)) return "Enter a whole number";

  if (min < 1) return "Start with 1 or more";

  if (max < 2) return "Allow 2 or more";

  if (max < min) return "Allow at least as many as you start with";

  if (max > MAX_ENTRIES) return "SSB takes up to 500";

  return null;
}

export function fieldArrayDrawing(label: string, value: FieldArray): FieldArrayDrawing {
  const { min, max } = value;

  return {
    // ponytail: draw at most three entries; the bounds still compile in full.
    legends: Array.from(
      { length: Math.min(min, 3) },
      (_, i) => `${label} ${i + 1}${min > 1 ? ` of ${min}` : ""}`,
    ),
    remove: min > 1 && min <= 3,
    ...(max > min && { add: value.addAnotherLabel ?? autoAddAnother(label) }),
  };
}
