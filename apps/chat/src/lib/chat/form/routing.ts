import type { UIMessage } from "@tanstack/ai";
import { getServerEnv } from "#/config/env";
import { FEEDBACK_FORM_ID } from "#/lib/chat/feedback";
import { lastUserText, recentUserText } from "#/lib/chat/messages";
import {
  decideRagFallback,
  topHandoffCandidateSlug,
} from "#/lib/chat/retrieval";
import type { Source } from "#/lib/chat/types";
import { matchFormsFromText } from "./detect";
import { getFormSlugs } from "./defs";
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
  // The feedback form is terminal: once submitted it can't be re-matched from
  // conversation text (it was pinned programmatically, not by the matcher), so
  // clear it instead of leaving the session stuck in feedback-collect forever.
  // feedbackOffered is preserved, so it is never re-offered this session.
  if (session.slug === FEEDBACK_FORM_ID && session.status === "submitted") {
    resetSessionForNewForm(session);
  }
  if (session.slug && session.status !== "submitted") return;
  const windowMatch = await deps.match(recentUserText(messages));
  const matched =
    windowMatch && windowMatch.formId === session.handedOffSlug
      ? await deps.match(lastUserText(messages))
      : windowMatch;
  if (matched) {
    if (matched.formId !== session.slug) resetSessionForNewForm(session);
    session.slug = matched.formId;
    // Feedback can be started manually (the banner "Give feedback" link sends a
    // matcher phrase) as well as by the model's offer_feedback tool. Either way,
    // mark it spent so the model never also offers feedback later this session.
    if (matched.formId === FEEDBACK_FORM_ID) session.feedbackOffered = true;
  }
}

export interface RagFallbackResult {
  resolution: FormResolution;
  handoffContinuation?: { title: string; url: string };
  // Approved collect form RAG surfaced that the matcher missed (ADR 0045).
  ragCollectLink?: { title: string; url: string };
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
  illegitimate: boolean,
  signal: AbortSignal,
  deps: RagFallbackDeps = {
    getSlugs: getFormSlugs,
    resolve: resolveActiveForm,
    formsUrl: () => getServerEnv().FORMS_URL,
  },
): Promise<RagFallbackResult> {
  const ragCandidate =
    resolution.kind === "none" && !session.slug && !illegitimate
      ? topHandoffCandidateSlug(rawSources)
      : null;
  // Resolve against the forms API only when there's a candidate, and gate on
  // the form index so a retrieved info-only service with no published form
  // doesn't trigger a doomed form-definition fetch and a 404 warning per turn.
  let ragResolution: FormResolution = { kind: "none" };
  if (ragCandidate && (await deps.getSlugs(signal)).includes(ragCandidate)) {
    ragResolution = await deps.resolve(ragCandidate, {});
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
    session.handedOffSlug = ragCandidate;
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
    // RAG surfaced an APPROVED collect form the title matcher missed (e.g. a
    // follow-up like "is there a form i can fill out", or a paraphrase that
    // doesn't overlap the form title). Per ADR 0045, RAG must NOT auto-start
    // inline collection — that stays behind the higher-confidence title
    // matcher. But we also must not fall through to the no-online-form /
    // paper path (the bug behind business-mail & deceased-mail). So OFFER the
    // form LINK — the low-commitment action the ADR explicitly lets the fuzzy
    // RAG signal trigger. No pin, no collect: if the user then clearly states
    // intent, the matcher/apply path starts collection. ragCandidate is gated
    // to allowlisted published forms above.
    return {
      resolution,
      ragCollectLink: {
        title: ragResolution.form.contract.title,
        url: `${deps.formsUrl()}/forms/${encodeURIComponent(ragCandidate)}`,
      },
    };
  }
  return { resolution };
}
