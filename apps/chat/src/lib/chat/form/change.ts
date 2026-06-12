import type { Primitive } from "@govtech-bb/form-types";
import { parseChangeRequest } from "../change-field";
import { getActiveFieldIds, isChatCollectable } from "./schema";
import type { ActiveFormSchema } from "./schema";
import type { FormSession } from "./session";

export interface ChangeFieldTarget {
  field: Primitive;
  stepId: string;
}

// A deterministic check-your-answers "Change" request: resolve the review row's
// label back to the single active field it names, so the server can re-present
// that one field itself instead of routing the request through the model. The
// candidate set mirrors buildReviewItems (active, chat-collectable, no
// show-hide toggles), so the label the user clicked always round-trips.
//
// Returns null — and the caller falls through to the model, exactly like
// matchPendingOption — when the message isn't a change request, or the label
// doesn't resolve to EXACTLY one field (unknown, or an ambiguous duplicate).
export function matchChangeField(
  form: ActiveFormSchema,
  session: FormSession,
  text: string,
): ChangeFieldTarget | null {
  const label = parseChangeRequest(text);
  if (!label) return null;
  const wanted = label.toLowerCase();
  const active = getActiveFieldIds(form.contract, session.values).flat;

  const matches: ChangeFieldTarget[] = [];
  for (const step of form.contract.steps) {
    for (const field of step.elements) {
      if (!active.has(field.fieldId)) continue;
      if (!isChatCollectable(field)) continue;
      if (field.htmlType === "show-hide") continue;
      if (field.label.trim().toLowerCase() === wanted) {
        matches.push({ field, stepId: step.stepId });
      }
    }
  }
  // Exactly one match, or we can't be sure which field they meant.
  return matches.length === 1 ? matches[0]! : null;
}

// Reset a field so it can be re-asked: drop its value and invalidate the last
// review (submit_form refuses until a fresh review runs, same as set_field).
// The fieldId stays in askedFieldIds — a required field with no value is
// re-served by nextAskableField, so a re-picked CHOICE answer is recorded by
// the existing deterministic option path; a free-text re-answer falls through
// to the model's set_field, as it does on first ask.
export function resetFieldForChange(
  session: FormSession,
  fieldId: string,
): void {
  delete session.values[fieldId];
  session.reviewedSinceChange = false;
  session.updatedAt = Date.now();
}
