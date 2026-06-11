import type { UIMessage } from "@tanstack/ai";
import { getServerEnv } from "#/config/env";
import { FEEDBACK_FORM_ID } from "#/lib/chat/feedback";
import { isInfoQuestion } from "#/lib/chat/guards";
import { lastUserText, recentUserText } from "#/lib/chat/messages";
import {
  decideRagFallback,
  topHandoffCandidateSlug,
} from "#/lib/chat/retrieval";
import type { Source } from "#/lib/chat/types";
import { matchFormsFromText } from "./detect";
import { getAllFormSlugs, getFormSlugs } from "./defs";
import { offerForm, parkHandoff, pinForm } from "./funnel";
import { resolveActiveForm, type FormResolution } from "./schema";
import { resetSessionForNewForm, type FormSession } from "./session";

// Injectable seams for the network-backed collaborators (form index fetch,
// contract resolution) so the routing decisions are unit-testable. Defaults
// are the real implementations — production callers pass nothing.
interface PinDeps {
  match: typeof matchFormsFromText;
}

interface RagFallbackDeps {
  getSlugs: typeof getFormSlugs;
  getAllSlugs: typeof getAllFormSlugs;
  resolve: typeof resolveActiveForm;
  formsUrl: () => string;
}

// Pin the session to a form the user's recent messages name (token-overlap
// matcher). A handed-off form (file upload / payment) isn't pinned to the
// session, so it re-enters matching from the rolling window. If the window
// still points at the form we just handed off, defer to what the user's
// LATEST message matches (possibly nothing) so they aren't re-handed the same
// link turn after turn, and a genuine topic switch still activates.
export async function pinSessionForm(
  session: FormSession,
  messages: UIMessage[],
  deps: PinDeps = { match: matchFormsFromText },
): Promise<void> {
  // A submitted form is terminal — the application is done, nothing more to
  // collect — so unpin it. Otherwise the matcher re-pins it from the rolling
  // window (which still names the just-completed form), resolution stays
  // "collect", and the feedback offer (which needs "none") can never fire after
  // an application (#1203). The feedback form clears outright: it's pinned
  // programmatically and can never be re-matched from text, and feedbackOffered
  // survives the reset so it isn't re-offered. A real service form is PARKED
  // instead — handedOffSlug makes the rolling-window matcher defer to the user's
  // LATEST message, so their earlier application messages don't re-wedge them
  // into the finished form, while a fresh mention of any service re-engages.
  if (session.slug && session.status === "submitted") {
    if (session.slug === FEEDBACK_FORM_ID) {
      resetSessionForNewForm(session);
    } else {
      parkHandoff(session, session.slug);
    }
  }
  // A zero-value chat-feedback pin is really still an OPEN OFFER: offer_feedback
  // pins on offer (the cheap accept path), but the user hasn't committed yet. A
  // reply that isn't accept/decline-shaped is a topic switch, and the normal
  // early-return below would trap them on the feedback form (#1202). Treat it
  // like a lapsed offer, keyed off the LATEST message only (not the rolling
  // window, which still names the pre-feedback conversation): a match for
  // another form re-pins to it; an info-question with no match releases the pin
  // to normal no-form routing so RAG can answer. A yes/no-shaped reply falls
  // through and stays pinned for the collect-feedback turn. feedbackOffered is
  // preserved either way — a topic switch reads as an implicit decline, so the
  // offer is never repeated this session.
  if (
    session.slug === FEEDBACK_FORM_ID &&
    session.status !== "submitted" &&
    Object.keys(session.values).length === 0
  ) {
    const switchMatch = await deps.match(lastUserText(messages));
    if (switchMatch && switchMatch.formId !== FEEDBACK_FORM_ID) {
      pinForm(session, switchMatch.formId);
      return;
    }
    if (isInfoQuestion(lastUserText(messages))) {
      resetSessionForNewForm(session);
      // resetSessionForNewForm preserves feedbackOffered, but re-assert it so
      // the implicit-decline invariant holds no matter how we reached a
      // zero-value feedback pin — the offer is never repeated this session.
      session.feedbackOffered = true;
      return;
    }
  }
  if (session.slug && session.status !== "submitted") return;
  const windowMatch = await deps.match(recentUserText(messages));
  const matched =
    windowMatch && windowMatch.formId === session.handedOffSlug
      ? await deps.match(lastUserText(messages))
      : windowMatch;
  if (matched) {
    pinForm(session, matched.formId);
    // Feedback can be started manually (the banner "Give feedback" link sends a
    // matcher phrase) as well as by the model's offer_feedback tool. Either way,
    // mark it spent so the model never also offers feedback later this session.
    if (matched.formId === FEEDBACK_FORM_ID) session.feedbackOffered = true;
  }
}

export interface RagFallbackResult {
  resolution: FormResolution;
  handoffContinuation?: { title: string; url: string };
  // Approved collect form RAG surfaced that the matcher missed. Per ADR 0048
  // this is an OFFER (fill here / link), not a bare link: the user's tap is
  // the confidence top-up ADR 0045 wanted before inline collection.
  formOffer?: { slug: string; title: string };
  // The top retrieved service has a PUBLISHED form that is not chat-approved
  // (no policy entry). The disclosure must not claim no online form exists —
  // that was a lie for these services (school-uniform-grant et al).
  unapprovedForm?: boolean;
}

// RAG-driven handoff (and its follow-up continuation). The title-token matcher
// only fires when the user's wording overlaps a form title (e.g. "conductor
// licence"). When it didn't pin a form, fall back to the top retrieved
// service — if it maps to a published form that must be completed in the
// forms app (file upload / payment), surface that link rather than a plain
// informational answer. This is what makes phrasings like "how do I become a
// conductor" reach the conductor application.
//
// A candidate is computed only when no form is pinned: kind "none" so we never
// upgrade a matched collectible form, and !session.slug so a pinned form that
// merely failed to resolve (a transient form-API blip) can't redirect the user
// elsewhere. The matcher ran this turn, so the form index is warm-cached.
export async function applyRagFallback(
  resolution: FormResolution,
  session: FormSession,
  rawSources: Source[],
  signal: AbortSignal,
  deps: RagFallbackDeps = {
    getSlugs: getFormSlugs,
    getAllSlugs: getAllFormSlugs,
    resolve: resolveActiveForm,
    formsUrl: () => getServerEnv().FORMS_URL,
  },
): Promise<RagFallbackResult> {
  const ragCandidate =
    resolution.kind === "none" && !session.slug
      ? topHandoffCandidateSlug(rawSources)
      : null;
  // Resolve against the forms API only when there's a candidate, and gate on
  // the approved index so a retrieved info-only service with no published form
  // doesn't trigger a doomed form-definition fetch and a 404 warning per turn.
  let ragResolution: FormResolution = { kind: "none" };
  if (ragCandidate) {
    if ((await deps.getSlugs(signal)).includes(ragCandidate)) {
      ragResolution = await deps.resolve(ragCandidate, {});
    } else if ((await deps.getAllSlugs(signal)).includes(ragCandidate)) {
      // Published but not in the chat policy: don't surface the form, but
      // don't let the no-form disclosure claim it doesn't exist either.
      return { resolution, unapprovedForm: true };
    }
  }
  const ragDecision = decideRagFallback({
    candidate: ragCandidate,
    candidateHandoff: ragResolution.kind === "handoff",
    handedOffSlug: session.handedOffSlug ?? null,
  });
  if (
    ragDecision.action === "fresh-handoff" &&
    ragResolution.kind === "handoff"
  ) {
    // Park it like the matcher-driven handoff does, so the user isn't
    // re-handed the strict link on every later turn.
    parkHandoff(session, ragCandidate);
    return { resolution: ragResolution };
  }
  if (
    ragDecision.action === "continuation" &&
    ragResolution.kind === "handoff"
  ) {
    // The user was already handed this form's link and is following up ("ok
    // let's begin", "what's next?"). Re-issuing the strict link-only handoff
    // is noisy, but the no-form path makes the model hallucinate inline
    // collection or deny the form exists. Instead keep answering
    // informationally while pointing back to the link. (Already parked.)
    return {
      resolution,
      handoffContinuation: {
        title: ragResolution.title,
        url: ragResolution.url,
      },
    };
  }
  if (ragResolution.kind === "collect" && ragCandidate) {
    // RAG surfaced an APPROVED collect form the title matcher missed (e.g.
    // "I'm moving house, how do I get my letters sent to the new place?" —
    // no title-token overlap, clear semantic match). RAG still never
    // AUTO-starts collection (ADR 0045's concern): the offer puts both
    // online options on the table and the user's tap on "fill it out with
    // you here" is the deterministic confirm that pins the form (ADR 0048).
    // Before this, the same need phrased lexically got full guided
    // collection while natural phrasing got only a link.
    const offer = {
      slug: ragCandidate,
      title: ragResolution.form.contract.title,
    };
    offerForm(session, offer);
    return { resolution, formOffer: offer };
  }
  return { resolution };
}
