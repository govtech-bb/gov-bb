import {
  presentChoicesDef,
  setFieldDef,
  submitFormDef,
} from "#/lib/chat-tools";
import type { ActiveFormSchema } from "./schema";
import { getActiveFieldIds } from "./schema";
import type { FormSession } from "./session";
import { submitFormUpstream } from "./submit";

export function buildFormTools(
  session: FormSession,
  schema: ActiveFormSchema,
  signal: AbortSignal,
) {
  return [
    presentChoicesDef.server(async () => ({ shown: true })),

    setFieldDef.server(async ({ fieldId, value }) => {
      // A previous set_field in this turn may have activated a conditional
      // field — recompute the active set against the current values.
      const active = getActiveFieldIds(schema.contract, session.values).flat;
      if (!active.has(fieldId)) {
        return {
          ok: false,
          error: `unknown or inactive fieldId: ${fieldId}`,
        };
      }
      session.values[fieldId] = value;
      session.updatedAt = Date.now();
      return { ok: true };
    }),

    submitFormDef.server(async () => {
      if (!session.slug) {
        return {
          ok: false,
          errors: [{ field: "service", message: "no active form" }],
        };
      }
      if (session.status === "submitted" && session.referenceNumber) {
        return { ok: true, referenceNumber: session.referenceNumber };
      }
      if (session.status === "submitting") {
        return {
          ok: false,
          errors: [
            { field: "service", message: "a submission is already in flight" },
          ],
        };
      }
      session.status = "submitting";
      session.updatedAt = Date.now();
      const result = await submitFormUpstream(
        session.slug,
        session.values,
        session.submissionId,
        signal,
      );
      session.updatedAt = Date.now();
      if (result.ok) {
        session.status = "submitted";
        session.referenceNumber = result.referenceNumber;
        return { ok: true, referenceNumber: result.referenceNumber };
      }
      session.status = "failed";
      session.lastError = result.errors[0]?.message;
      return { ok: false, errors: result.errors };
    }),
  ];
}
