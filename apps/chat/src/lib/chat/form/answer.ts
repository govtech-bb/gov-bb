import type { Primitive } from "@govtech-bb/form-types";
import { findEscapeToggle, nextAskableField } from "./schema";
import type { ActiveFormSchema } from "./schema";
import type { FormSession } from "./session";
import { canonicalizeRaw, validateCollectedField } from "./values";

export interface PendingOptionAnswer {
  field: Primitive;
  stepId: string;
  value: string;
}

// A deterministic option selection: when the CURRENT pending question is a
// choice field and the user's message matches one of its options (by label or
// value), the server records it itself rather than routing the label through
// the model — which mis-reads filler-like labels ("Okay") as chit-chat and
// re-asks. Scoped to plain single/multi-select option fields:
//   - show-hide toggles (reveal extra fields) and escape-hatch fields (National
//     ID / passport either-or) keep the model path — their side effects live in
//     set_field and aren't worth duplicating here.
//   - free-text fields have no options to match, so they're untouched.
// A non-matching message (a real free-text answer, a question, "skip") returns
// null and falls through to the normal model turn.
export function matchPendingOption(
  form: ActiveFormSchema,
  session: FormSession,
  text: string,
): PendingOptionAnswer | null {
  const next = nextAskableField(
    form.contract,
    session.values,
    session.askedFieldIds,
  );
  if (!next) return null;
  const field = next.field;
  if (field.htmlType === "show-hide") return null;
  if (findEscapeToggle(form.contract, field)) return null;
  const options = field.options;
  if (!options?.length) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const resolve = (s: string) => {
    const lower = s.trim().toLowerCase();
    return options.find(
      (o) => o.label.toLowerCase() === lower || o.value.toLowerCase() === lower,
    );
  };

  if (field.multiple) {
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const matched = parts.map(resolve);
    if (!parts.length || matched.some((m) => !m)) return null;
    return {
      field,
      stepId: next.stepId,
      value: matched.map((m) => m!.value).join(","),
    };
  }

  const opt = resolve(trimmed);
  return opt ? { field, stepId: next.stepId, value: opt.value } : null;
}

// Record a deterministically-matched option value. Mirrors set_field's
// validate-then-canonicalise-then-store, scoped to the matched option (no
// escape-toggle / reveal handling — those fields are excluded by
// matchPendingOption). Returns false if validation rejects, so the caller can
// fall through to the model instead of swallowing the error.
export function recordOptionValue(
  form: ActiveFormSchema,
  session: FormSession,
  answer: PendingOptionAnswer,
): boolean {
  const error = validateCollectedField(
    form.contract,
    answer.field,
    answer.stepId,
    answer.value,
    session.values,
  );
  if (error) return false;
  session.values[answer.field.fieldId] = canonicalizeRaw(
    answer.field,
    answer.value,
  );
  // Any change invalidates the last review — submit_form refuses until a fresh
  // review has run, exactly as set_field does.
  session.reviewedSinceChange = false;
  session.updatedAt = Date.now();
  return true;
}
