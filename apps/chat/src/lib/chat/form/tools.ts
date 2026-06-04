import {
  presentChoicesDef,
  setFieldDef,
  submitFormDef,
} from "#/lib/chat-tools";
import type { ActiveFormSchema } from "./schema";
import { getActiveFieldIds } from "./schema";
import type { FormSession } from "./session";
import { submitFormUpstream, type SubmitOutcome } from "./submit";

export function buildFormTools(
  session: FormSession,
  schema: ActiveFormSchema,
  signal: AbortSignal,
) {
  return [
    // Deliberate no-op. present_choices is a UI signal, not real work: the
    // client (bubble.tsx) reads the tool-call args off the message and renders
    // the choice buttons; clicking one sends the answer back as a NEW user
    // message, which re-runs field detection next turn. Do NOT turn this into a
    // client tool — the result here is irrelevant, the args are the payload.
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

    submitFormDef.server(async (_args, ctx) => {
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
      // The upstream POST blocks for a few seconds and produces no text, so the
      // client has nothing to show after the user approves. Stream a status so
      // the UI can render a "Submitting…" indicator instead of dead air.
      ctx?.emitCustomEvent("submit_status", { state: "submitting" });
      let result: SubmitOutcome;
      try {
        result = await submitFormUpstream(
          session.slug,
          session.values,
          session.submissionId,
          signal,
        );
      } catch (err) {
        // A throw (vs a structured {ok:false}) would otherwise leave the
        // session pinned at "submitting" forever and never emit a terminal
        // status, wedging retries and the client's progress indicator.
        session.status = "failed";
        session.lastError = err instanceof Error ? err.message : String(err);
        session.updatedAt = Date.now();
        ctx?.emitCustomEvent("submit_status", { state: "failed" });
        throw err;
      }
      session.updatedAt = Date.now();
      if (result.ok) {
        session.status = "submitted";
        session.referenceNumber = result.referenceNumber;
        ctx?.emitCustomEvent("submit_status", { state: "submitted" });
        return { ok: true, referenceNumber: result.referenceNumber };
      }
      session.status = "failed";
      session.lastError = result.errors[0]?.message;
      ctx?.emitCustomEvent("submit_status", { state: "failed" });
      return { ok: false, errors: result.errors };
    }),
  ];
}
