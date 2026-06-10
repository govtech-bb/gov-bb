import {
  askFieldDef,
  declineFeedbackDef,
  offerFeedbackDef,
  presentChoicesDef,
  reviewFormDef,
  setFieldDef,
  submitFormDef,
} from "#/lib/chat-tools";
import {
  cancelFeedbackForm,
  FEEDBACK_FORM_ID,
  pinFeedbackForm,
  submitSuccessForModel,
} from "#/lib/chat/feedback";
import type { ActiveFormSchema } from "./schema";
import { buildFieldIndex, getActiveFieldIds } from "./schema";
import type { FormSession } from "./session";
import { submitFormUpstream, type SubmitOutcome } from "./submit";
import { buildReviewItems, validateCollectedField } from "./values";

// Request-scoped dependencies the form tools need, supplied per turn via
// chat({ context }) and read back as ctx.context — the documented runtime-
// context pattern, instead of manufacturing closure-bound tools every turn.
// `form` is null on turns without an active collect-type form; the field
// tools aren't registered on those turns, the guard is for the type system.
export interface FormTurnContext {
  session: FormSession;
  form: ActiveFormSchema | null;
  signal: AbortSignal;
}

// Deliberate no-op. present_choices is a UI signal, not real work: the client
// (bubble.tsx) reads the tool-call args off the message and renders the choice
// buttons; clicking one sends the answer back as a NEW user message, which
// re-runs field detection next turn. Do NOT turn this into a client tool — the
// result here is irrelevant, the args are the payload.
const presentChoicesTool = presentChoicesDef.server(async () => ({
  shown: true,
}));

// The model passes ONLY a fieldId; the canonical spec is read from the
// CONTRACT and returned as the tool result, so the client renders from
// part.output and the model never authors labels or options.
const askFieldTool = askFieldDef.server<FormTurnContext>(
  async ({ fieldId }, ctx) => {
    const { session, form } = ctx.context;
    if (!form) return { ok: false, error: "no active form" };
    const active = getActiveFieldIds(form.contract, session.values).flat;
    const info = buildFieldIndex(form.contract).get(fieldId);
    if (!info || !active.has(fieldId)) {
      return { ok: false, error: `unknown or inactive fieldId: ${fieldId}` };
    }
    const f = info.field;
    return {
      ok: true,
      field: {
        fieldId: f.fieldId,
        label: f.label,
        htmlType: f.htmlType,
        hint: f.hint ?? undefined,
        multiple: f.multiple ?? undefined,
        options: f.options?.map((o) => ({ label: o.label, value: o.value })),
        validations: f.validations ?? undefined,
      },
    };
  },
);

const setFieldTool = setFieldDef.server<FormTurnContext>(
  async ({ fieldId, value }, ctx) => {
    const { session, form } = ctx.context;
    if (!form) {
      return { ok: false, error: "no active form" };
    }
    // A previous set_field in this turn may have activated a conditional
    // field — recompute the active set against the current values.
    const active = getActiveFieldIds(form.contract, session.values).flat;
    if (!active.has(fieldId)) {
      return {
        ok: false,
        error: `unknown or inactive fieldId: ${fieldId}`,
      };
    }
    // Validate at collection time so the model re-asks immediately, instead
    // of parking a bad value until submit fails.
    const info = buildFieldIndex(form.contract).get(fieldId);
    if (!info) {
      return { ok: false, error: `unknown fieldId: ${fieldId}` };
    }
    const error = validateCollectedField(
      form.contract,
      info.field,
      info.stepId,
      value,
      session.values,
    );
    if (error) {
      return { ok: false, error };
    }
    session.values[fieldId] = value;
    session.updatedAt = Date.now();
    return { ok: true };
  },
);

// Check-your-answers rows built from the SESSION + CONTRACT — the model never
// authors (and can't misquote) the user's values.
const reviewFormTool = reviewFormDef.server<FormTurnContext>(
  async (_args, ctx) => {
    const { session, form } = ctx.context;
    if (!form) return { ok: false, error: "no active form" };
    const active = getActiveFieldIds(form.contract, session.values).flat;
    const items = buildReviewItems(form.contract, session.values, active);
    if (!items.length) return { ok: false, error: "nothing collected yet" };
    // isFeedback lets the client word the submit approval as "Submit your
    // feedback now?" — review_form runs in the same turn just before the
    // (argument-less) submit_form approval prompt, so it's the carrier.
    return { ok: true, items, isFeedback: session.slug === FEEDBACK_FORM_ID };
  },
);

const submitFormTool = submitFormDef.server<FormTurnContext>(
  async (_args, ctx) => {
    const { session, signal } = ctx.context;
    if (!session.slug) {
      return {
        ok: false,
        errors: [{ field: "service", message: "no active form" }],
      };
    }
    if (session.status === "submitted" && session.referenceNumber) {
      return submitSuccessForModel(session.slug, session.referenceNumber);
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
    // isFeedback lets the indicator read "Submitting your feedback".
    ctx.emitCustomEvent("submit_status", {
      state: "submitting",
      isFeedback: session.slug === FEEDBACK_FORM_ID,
    });
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
      ctx.emitCustomEvent("submit_status", { state: "failed" });
      throw err;
    }
    session.updatedAt = Date.now();
    if (result.ok) {
      session.status = "submitted";
      session.referenceNumber = result.referenceNumber;
      ctx.emitCustomEvent("submit_status", { state: "submitted" });
      return submitSuccessForModel(session.slug, result.referenceNumber);
    }
    session.status = "failed";
    session.lastError = result.errors[0]?.message;
    ctx.emitCustomEvent("submit_status", { state: "failed" });
    return { ok: false, errors: result.errors };
  },
);

// Tools for an OFFER-ONLY turn: a collect-type form matched on an info question
// (nothing collected yet). We deliberately withhold set_field/submit_form so the
// model can't silently start recording fields on what is still a question — but
// present_choices IS available so the model can offer a clickable "Start the
// application" affordance instead of a dead-end prose "want to start?". Clicking
// it sends a non-question message next turn, which flips offerOnly off and lets
// the real collection tools in. See run-turn.ts `offerOnly`.
export function buildOfferTools() {
  return [presentChoicesTool];
}

export function buildFormTools() {
  return [
    presentChoicesTool,
    askFieldTool,
    setFieldTool,
    reviewFormTool,
    submitFormTool,
  ];
}

// End-of-chat feedback offer. The handler pins the chat-feedback form so the
// normal collect flow runs from the next turn — the model only decides WHEN to
// offer. No approval: pinning a form is not a user-visible side effect.
const offerFeedbackTool = offerFeedbackDef.server<FormTurnContext>(
  async (_args, ctx) => {
    pinFeedbackForm(ctx.context.session);
    return { ok: true };
  },
);

// The only tool exposed on a no-form turn (until feedback is offered once):
// lets the model invite feedback at a natural conclusion. See run-turn.ts.
export function buildEndOfChatTools() {
  return [offerFeedbackTool];
}

// Closes the optional feedback form when the user declines the invitation (or
// bails mid-form). Unpins the session — the offer stays spent, so it is not
// repeated. Bound only while the feedback form is the active form.
const declineFeedbackTool = declineFeedbackDef.server<FormTurnContext>(
  async (_args, ctx) => {
    cancelFeedbackForm(ctx.context.session);
    return { ok: true };
  },
);

// Tools while the optional feedback form is active: the normal collect tools
// PLUS decline_feedback, so a user who only agreed to *consider* feedback can
// bow out instead of being railroaded into the form. See run-turn.ts.
export function buildFeedbackTools() {
  return [...buildFormTools(), declineFeedbackTool];
}
