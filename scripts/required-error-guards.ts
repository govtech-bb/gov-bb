/**
 * Lint the required-message convention (#2227) on a parsed recipe: every field
 * a citizen must fill in has to fail with a message that names the field, not
 * a field-less one like "This field is required" or "Select an option".
 *
 * The error summary lists each field's message as the link text, so when two
 * required fields on one step both fall through to the generic default the
 * summary shows identical lines and the applicant cannot tell which field is
 * empty (the NHC employment step in the audit showed three). That is a recipe
 * defect, so it is caught on the trunk instead of in production.
 *
 * Unlike the file-field guard this one resolves refs and merges overrides the
 * way the serving path does (`applyFieldOverrides`), because the effective
 * message can come from either side:
 *
 *  - the generic primitives (`components/generic-*`) SHIP the generic message,
 *    so a recipe that only overrides `fieldId` + `label` inherits it;
 *  - `validations` merge per rule key, so an override that restates
 *    `required: { value: true }` over a component with a good message REPLACES
 *    the whole rule and drops the message — the field then falls through to
 *    `defaultValidationMessage("required")` at runtime.
 *
 * Date fields are exempt: `validateDateField` never reaches the required
 * runner and composes its own label-aware `Enter ${label}` when no `error` is
 * authored, so a bare date field already names itself.
 *
 * Returns human-readable error strings (empty when clean).
 */
import type { Block, FieldOverrides, Primitive } from "@govtech-bb/form-types";
import { applyFieldOverrides } from "@govtech-bb/form-types";
import { defaultValidationMessage } from "@govtech-bb/form-validation";

interface Elementish {
  ref?: unknown;
  overrides?: unknown;
}

function isBlock(entry: Primitive | Block): entry is Block {
  return "blockId" in entry;
}

/** Mirrors validateFieldEntries: `required` present and not explicitly false. */
function isEffectivelyRequired(field: Primitive): boolean {
  const required = field.validations?.required;
  return required !== undefined && required.value !== false;
}

/**
 * Messages that identify no field: the runtime default, plus the stock phrases
 * authors reach for on a choice field. They fail the same way — two of them on
 * one step give the error summary two identical links. A message that names
 * what to pick ("Select your parish") is fine.
 *
 * Compared after `normalise`, because punctuation and casing drift while the
 * message stays just as field-less — trailing full stops are a live habit in
 * the recipe set ("Enter your address.").
 */
const normalise = (message: string): string =>
  message.trim().replace(/\.$/, "").toLowerCase();

const FIELDLESS_MESSAGES = new Set(
  [
    defaultValidationMessage("required"),
    "Select an option",
    "Select an answer",
    "Select yes or no",
    "Select at least one option",
  ].map(normalise),
);

function checkField(field: Primitive, where: string): string | null {
  if (!isEffectivelyRequired(field)) return null;

  const error = field.validations?.required?.error;
  if (error === undefined) {
    // An unauthored date is exempt: validateDateField composes its own
    // label-aware `Enter ${label}` rather than reaching the required runner.
    if (field.htmlType === "date") return null;
    const generic = defaultValidationMessage("required");
    return `${where} has no required.error and would show the generic "${generic}" — add an error naming what to enter`;
  }
  // An authored message IS shown verbatim, dates included, so it is not exempt.
  if (FIELDLESS_MESSAGES.has(normalise(error))) {
    return `${where} uses the generic "${error}" as its required.error — replace it with an error naming the field`;
  }
  return null;
}

export function checkRequiredErrorsAreSpecific(
  recipe: unknown,
  relative: string,
  registry: Record<string, Primitive | Block>,
): string[] {
  const errors: string[] = [];
  const steps = (recipe as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return errors;

  for (const step of steps) {
    const stepId = (step as { stepId?: unknown }).stepId;
    const elements = (step as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) continue;

    for (const raw of elements) {
      const el = raw as Elementish;
      if (typeof el?.ref !== "string") continue;
      // Unresolved refs are the ref guard's job; nothing to merge here.
      const entry = registry[el.ref];
      if (!entry) continue;

      const resolved: Primitive[] = isBlock(entry)
        ? entry.elements.map((child) => {
            const childOverride = (
              el.overrides as Record<string, FieldOverrides> | undefined
            )?.[child.fieldId];
            return childOverride
              ? applyFieldOverrides(child, childOverride)
              : child;
          })
        : [
            applyFieldOverrides(
              entry,
              (el.overrides as FieldOverrides | undefined) ?? {},
            ),
          ];

      for (const field of resolved) {
        const where = `${relative}: ${String(stepId)}.${field.fieldId} (${el.ref})`;
        const error = checkField(field, where);
        if (error) errors.push(error);
      }
    }
  }

  return errors;
}
