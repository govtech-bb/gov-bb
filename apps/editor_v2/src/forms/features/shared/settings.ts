import { relativeDateOf } from "../../core/field-settings";
import type { Settings } from "../../core/settings";
import type { FieldIssue } from "../../core/fields";

/** Projection cleanup only: authored values, including unfinished values, remain in source. */
export function cleanSettings(raw: Settings, omitted: readonly string[]) {
  const copy = { ...raw };

  for (const key of ["ref", ...omitted]) delete copy[key];

  if (copy.isDisabled === false) delete copy.isDisabled;

  if (!relativeDateOf(copy)) delete copy.relativeDate;

  return copy;
}

export function widthIssues(raw: Settings, where: string): FieldIssue[] {
  return raw.width !== undefined &&
    (typeof raw.width !== "string" || !["short", "medium", "long"].includes(raw.width))
    ? [{ code: "field-width", message: "Field width must be short, medium or long", where }]
    : [];
}

export function nonRepeatableIssues(raw: Settings, where: string): FieldIssue[] {
  return raw.fieldArray !== undefined
    ? [{ code: "field-array-kind", message: "This field cannot be answered more than once", where }]
    : [];
}
