import type { UIMessage } from "@tanstack/ai";
import { getServerEnv } from "#/config/env";
import {
  FEEDBACK_FORM_ID,
  FEEDBACK_TRIGGER_PHRASE,
  pinFeedbackForm,
} from "#/lib/chat/feedback";
import { isInfoQuestion } from "#/lib/chat/guards";
import { lastUserText, recentUserText } from "#/lib/chat/messages";
import {
  decideRagFallback,
  topHandoffCandidateSlug,
} from "#/lib/chat/retrieval";
import type { Source } from "#/lib/chat/types";
import { matchFormCandidates } from "./detect";
import { getAllFormSlugs, getFormSlugs } from "./defs";
import {
  consumeDisambiguationChoice,
  offerDisambiguation,
  offerForm,
  parkHandoff,
  pinForm,
} from "./funnel";
import { resolveActiveForm, type FormResolution } from "./schema";
import { resetSessionForNewForm, type FormSession } from "./session";

// Injectable seams for the network-backed collaborators (form index fetch,
// contract resolution) so the routing decisions are unit-testable. Defaults
// are the real implementations — production callers pass nothing.
interface PinDeps {
  matchCandidates: typeof matchFormCandidates;
}

export interface PinResult {
  // The user's wording named SEVERAL forms about equally well and none was
  // pinned: their titles, for run-turn to surface as a disambiguation choice
  // list rather than guessing one form (#1296). Absent on the common path.
  ambiguousTitles?: string[];
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
  deps: PinDeps = { matchCandidates: matchFormCandidates },
): Promise<PinResult> {
  // A submitted form is terminal — the application is done, nothing more to
  // collect — so unpin it; otherwise the matcher re-pins it from the rolling
  // window (which still names the just-completed form) and traps the user.
  //   - Feedback form: clear outright. It's pinned programmatically and can
  //     never be re-matched from text; feedbackOffered survives the reset.
  //   - Real form, feedback not yet offered: a completed application is the
  //     most natural moment to ask, so AUTO-PIN the chat-feedback form. The
  //     submit turn's prompt already invited it once (the collect-branch
  //     forward-looking guidance in prompt-builder), and this zero-value pin is
  //     an OPEN OFFER — the open-offer release below still lets a topic switch
  //     or info-question escape, so the user isn't trapped. pinFeedbackForm
  //     marks feedbackOffered, so it's never asked twice. (Supersedes the #1203
  //     park-for-model-offer behaviour merged in #1220.)
  //   - Real form, feedback already offered/given: just PARK it (handedOffSlug
  //     defers the rolling-window matcher to the latest message) — no second
  //     ask; the confirmation fell back to the normal "anything else?" wrap-up.
  if (session.slug && session.status === "submitted") {
    if (session.slug === FEEDBACK_FORM_ID) {
      resetSessionForNewForm(session);
    } else if (!session.feedbackOffered) {
      pinFeedbackForm(session);
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
    // Single best is enough here: this only asks "did the user switch to some
    // other form" to release the open feedback offer; the full disambiguation
    // happens on the cold-start window match below.
    const switchMatch =
      (await deps.matchCandidates(lastUserText(messages)))[0] ?? null;
    if (switchMatch && switchMatch.formId !== FEEDBACK_FORM_ID) {
      pinForm(session, switchMatch.formId);
      return {};
    }
    if (isInfoQuestion(lastUserText(messages))) {
      resetSessionForNewForm(session);
      // resetSessionForNewForm preserves feedbackOffered, but re-assert it so
      // the implicit-decline invariant holds no matter how we reached a
      // zero-value feedback pin — the offer is never repeated this session.
      session.feedbackOffered = true;
      return {};
    }
  }
  if (session.slug && session.status !== "submitted") return {};
  // A tap on a disambiguation choice (#1296) resolves deterministically before
  // the matcher runs: the pill sends its title verbatim, so we pin that exact
  // form. Re-running the margin matcher instead would re-tie on the shared-token
  // variants and loop. "Something else" / a topic switch LAPSES — see below.
  const choice = consumeDisambiguationChoice(session, lastUserText(messages));
  if (choice?.kind === "pinned") return {};
  const disambiguationLapsed = choice?.kind === "lapsed";
  // The notice banner's "Give feedback" link sends the EXACT
  // FEEDBACK_TRIGGER_PHRASE. Pin chat-feedback by EXPLICIT id, not via the
  // title-token matcher: the matcher only picked it up because
  // "feedback"/"assistant" happen to be unique among form titles today, and a
  // future recipe carrying either token could out-score or tie-and-steal the
  // banner match (#1206). Mark the offer spent so the model never also offers
  // feedback later this session. The phrase is a statement (not a question), so
  // the turn still enters collect-feedback.
  //
  // A FREE-TYPED feedback request ("I want to give feedback") is NOT pinned here
  // — run-turn detects it first (looksLikeFeedbackIntent) and shows the
  // assistant/service disambiguation, so it never reaches this matcher. This
  // supersedes #1247, which pinned chat-feedback directly for typed requests;
  // the "About this assistant" tap now reaches the same form one step later,
  // while "About a service or the site" routes to the general feedback form.
  if (lastUserText(messages) === FEEDBACK_TRIGGER_PHRASE) {
    pinForm(session, FEEDBACK_FORM_ID);
    session.feedbackOffered = true;
    return {};
  }
  // Normally match the rolling window (carries multi-turn context). But when a
  // disambiguation just lapsed, the window still names the ambiguous phrase and
  // would re-offer the same set — so match the LATEST message only, letting
  // "Something else" (no match → fall through to RAG/no-form) or a topic switch
  // escape instead of looping.
  const windowCandidates = await deps.matchCandidates(
    disambiguationLapsed ? lastUserText(messages) : recentUserText(messages),
  );
  const candidates =
    !disambiguationLapsed &&
    windowCandidates[0] &&
    windowCandidates[0].formId === session.handedOffSlug
      ? await deps.matchCandidates(lastUserText(messages))
      : windowCandidates;
  const matched = candidates[0] ?? null;
  if (matched) {
    // Two or more near-tied candidates: the user's wording names several forms
    // about equally well ("redirect mail" → personal / individual / deceased).
    // Don't guess — leave the session UNPINNED, record the candidates as a
    // pending disambiguation (so the next turn's tap resolves deterministically,
    // not via the still-tied matcher), and hand the titles back so run-turn
    // surfaces them as a choice list (#1296).
    if (candidates.length >= 2) {
      const forms = candidates.map((c) => ({ slug: c.formId, title: c.title }));
      offerDisambiguation(session, forms);
      return { ambiguousTitles: forms.map((f) => f.title) };
    }
    pinForm(session, matched.formId);
    // A genuine free-text mention of the feedback form (rare, but possible) is
    // also a manual start, so mark the offer spent — same as the banner path
    // above — so the model never also offers feedback later this session.
    if (matched.formId === FEEDBACK_FORM_ID) session.feedbackOffered = true;
  }
  return {};
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
