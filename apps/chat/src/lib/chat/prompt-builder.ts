import type { SystemPrompt } from "@tanstack/ai";
import { FEEDBACK_FORM_ID } from "./feedback";
import type { FormResolution, FormSession } from "./form";
import { OFFER_CHOICE_FILL, OFFER_CHOICE_LINK } from "./form/funnel";
import {
  CLOSER_GUIDANCE,
  FEEDBACK_COLLECTION_GUIDANCE,
  FEEDBACK_OFFER_GUIDANCE,
  FORM_COLLECTION_PROTOCOL,
  NO_FORM_DISCLOSURE,
  SYSTEM_PROMPT,
  UNAPPROVED_FORM_DISCLOSURE,
  buildCantHelpDisclosure,
  buildDirectLinkDisclosure,
  buildDisambiguationDisclosure,
  buildFormOfferDisclosure,
  buildHandoffContinuationDisclosure,
  buildHandoffDisclosure,
  buildHandoffOfferDisclosure,
  buildMissDisclosure,
  buildSchemaDisclosure,
} from "./prompts";

type SystemEntry = SystemPrompt<never>;

// Everything the per-turn prompt selection depends on, made explicit so the
// branch logic is a pure function of its input (formsUrl included — no hidden
// env read), and each routing outcome is unit-testable.
export interface PromptTurnState {
  contextBlock: string;
  resolution: FormResolution;
  session: FormSession;
  formsUrl: string;
  handoffContinuation?: { title: string; url: string };
  offerOnly?: boolean;
  intent?: "info" | "apply";
  // RAG matched a collect form the title matcher missed — offer both online
  // options as clickable choices (ADR 0048).
  formOffer?: { slug: string; title: string };
  // The user took "just send me the link" on a prior offer.
  linkRequested?: { title: string; url: string };
  // Retrieval covered several distinct services — narrow with choices
  // instead of guessing (ADR 0048 stage 3).
  disambiguation?: { titles: string[] };
  // A published form exists for the retrieved service but isn't chat-approved
  // (no policy entry) — the disclosure must not deny the form exists.
  unapprovedForm?: boolean;
  noContext?: boolean;
  // We already asked one clarifying question on the prior miss and retrieval is
  // STILL empty (#1176) — switch from the clarify disclosure to the can't-help
  // one instead of re-asking. Only meaningful when noContext is true.
  missClarifyExhausted?: boolean;
  offerFeedback?: boolean;
  closer?: boolean;
}

export function buildSystemPrompts(state: PromptTurnState): SystemEntry[] {
  const {
    contextBlock,
    resolution,
    session,
    formsUrl,
    handoffContinuation,
    offerOnly = false,
    intent = "apply",
    formOffer,
    linkRequested,
    disambiguation,
    unapprovedForm = false,
    noContext = false,
    missClarifyExhausted = false,
    offerFeedback = false,
    closer = false,
  } = state;
  const prompts: SystemEntry[] = [
    SYSTEM_PROMPT,
    `Context for this turn:\n${contextBlock}`,
  ];

  if (resolution.kind === "handoff") {
    // apply-intent → hand over the link (the link IS the answer). info-intent
    // (a fact question that happens to map to a handoff service, e.g. "what
    // does a conductor's licence cost and where do I apply?") → answer the
    // question first and OFFER the link in prose, don't push it. The user
    // asked for a fact, not the form.
    prompts.push(
      intent === "info"
        ? buildHandoffOfferDisclosure(resolution.title)
        : buildHandoffDisclosure(resolution.title, resolution.url),
    );
    return prompts;
  }

  if (resolution.kind === "collect") {
    const { slug, schema } = resolution.form;
    // The canonical form link — the SAME URL the landing page's "Start now"
    // button uses (FORMS_URL/forms/<id>). Offered as the self-serve online
    // option alongside in-chat filling; we never send users to paper/in-person.
    const formUrl = `${formsUrl}/forms/${encodeURIComponent(slug)}`;
    const formTitle = resolution.form.contract.title;
    // The form-collection / review / submit protocol is injected ONLY here —
    // when a form is actually active — rather than living in the always-on
    // SYSTEM_PROMPT. On info / out-of-corpus / refusal / handoff turns (no
    // collectible form) those ~1.3k tokens of set_field/submit rules would just
    // compete for attention, so they stay out. Active-form behaviour is
    // unchanged: SYSTEM_PROMPT + this protocol == the old combined prompt.
    prompts.push(FORM_COLLECTION_PROTOCOL);
    // One combined form-state block instead of 3-4 separate system entries.
    // The schema disclosure already names the slug, so no separate marker.
    const parts = [buildSchemaDisclosure(slug, schema)];
    const entries = Object.entries(session.values);
    if (entries.length) {
      const lines = entries
        .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
        .join("\n");
      parts.push(
        `Already collected (do NOT re-ask these unless the user wants to change them):\n${lines}`,
      );
      // Mid-collection questions now retrieve context (see skipRetrieval) —
      // answer from it before resuming, instead of ignoring the question or
      // guessing.
      parts.push(
        "If the user's latest message is a QUESTION (cost, documents, timing, eligibility) rather than a field answer, answer it briefly from the context above FIRST, then continue with the next uncollected field in the same response.",
      );
    } else if (offerOnly) {
      // Collect-form matched on an INFO question, nothing collected yet. Answer,
      // then offer the TWO online options (fill in chat / use the link) via
      // present_choices — never a dead-end prose "want to start?".
      parts.push(
        `The user asked an INFORMATION question about this service and has NOT said they want to apply yet. First, answer their question from the context above. Then offer the online options by calling present_choices with a short question like "Want to apply? I can fill it out with you here, or send you the form link." and choices EXACTLY ["${OFFER_CHOICE_FILL}", "${OFFER_CHOICE_LINK}"]. Lead by mentioning you can fill it out together (many people do not realise the chat can do this). Do NOT ask for any form field and do NOT call set_field this turn — only answer, then offer the choice.`,
      );
    } else if (session.askedFieldIds.size > 0) {
      // The first question was already presented (the banner "Give feedback"
      // link clicked twice, or the user repeated the trigger) but nothing is
      // collected yet. The fresh-start line below ("has not started yet") would
      // contradict the history — the model already asked — and at temperature 0
      // it tends to narrate the question in prose instead of re-calling
      // ask_field, so the option pills never re-render (#1207 follow-up). Steer
      // the re-present explicitly: only ask_field renders the options.
      parts.push(
        "You have ALREADY shown the user the first question, but they haven't answered it yet (they re-opened the form or repeated themselves). Do NOT say you're starting over and do NOT describe the question or its options in text. Just call ask_field with no arguments to show that same question again with its option buttons.",
      );
    } else {
      // Collect-form matched with apply-intent, first turn: begin collecting per
      // the SYSTEM_PROMPT. Answer any side question they bundled in first.
      parts.push(
        "The user wants to apply and has not started yet. Open with a one-line acknowledgement and call ask_field with no arguments — the server serves the first question. If they also asked a side question, answer it from the context first.",
      );
    }
    // ONLINE OPTIONS — applies whenever this form is active. This service has a
    // working online form. The user has two ONLINE choices: fill it out with you
    // here in the chat, or do it themselves at the link. If they ask "is there a
    // form", "can I do it myself", or want the link, give them this markdown
    // link. NEVER suggest a paper form, downloading/printing, or visiting an
    // office in person — we encourage the online options only.
    parts.push(
      `ONLINE FORM LINK for this service: [${formTitle}](${formUrl}). If the user wants the link or prefers to do it themselves, share exactly that markdown link. NEVER suggest a paper form, printing/downloading a form, or going to an office in person — the only options to offer are filling it out here with you, or this online link.`,
    );
    // Reciting the reference number here is intentionally NOT feedback-safe:
    // it's never reached for the feedback form because pinSessionForm resets a
    // submitted feedback session (clearing slug + referenceNumber) before
    // resolution runs, so a post-submit feedback turn resolves to "none" and
    // never re-enters this collect branch. Real service forms still report it.
    if (session.status === "submitted" && session.referenceNumber) {
      parts.push(
        `Submission complete. Reference number: ${session.referenceNumber}. Do NOT submit again.`,
      );
    } else if (session.status === "failed" && session.lastError) {
      parts.push(
        `Last submission attempt failed: ${session.lastError}. Help the user correct the listed fields, then retry submit_form.`,
      );
    }
    prompts.push(parts.join("\n\n"));
    // The optional feedback form was offered as an invitation the user can
    // decline — give the model the accept/decline guidance and remind it the
    // rating comes from ask_field, not from any reply to the invitation.
    if (slug === FEEDBACK_FORM_ID) prompts.push(FEEDBACK_COLLECTION_GUIDANCE);
  } else if (handoffContinuation) {
    // Follow-up after a handoff: keep helping informationally but keep the link
    // in front of the user — never collect inline, never deny the form exists.
    prompts.push(
      buildHandoffContinuationDisclosure(
        handoffContinuation.title,
        handoffContinuation.url,
      ),
    );
  } else if (linkRequested) {
    // The user clicked "just send me the link" on a prior offer — deliver it.
    prompts.push(
      buildDirectLinkDisclosure(linkRequested.title, linkRequested.url),
    );
  } else if (formOffer) {
    // RAG surfaced an approved collect form the matcher missed: offer BOTH
    // online options as clickable choices. The user's tap is the confirm
    // (ADR 0048; supersedes ADR 0045's link-only fallback for collect forms).
    prompts.push(
      buildFormOfferDisclosure(
        formOffer.title,
        OFFER_CHOICE_FILL,
        OFFER_CHOICE_LINK,
      ),
    );
  } else if (disambiguation) {
    // Retrieval covered several distinct services: narrow with clickable
    // choices instead of guessing one (the disclosure keeps the follow-up
    // escape hatch — history can establish the topic this turn's retrieval
    // can't see).
    prompts.push(buildDisambiguationDisclosure(disambiguation.titles));
  } else if (closer) {
    // The user is winding the chat down (goodbye / thanks / "that's all", or a
    // terse "no"/"ok" after we asked "anything else?"). A brief warm sign-off,
    // NOT the miss disclosure's "guide toward the closest service" or
    // NO_FORM_DISCLOSURE's "answer the substance" — there's no substance on a
    // goodbye. If the feedback offer is still available this turn, invite it once
    // (#1125 — this is the natural-conclusion moment the offer was designed for).
    prompts.push(CLOSER_GUIDANCE);
    if (offerFeedback) prompts.push(FEEDBACK_OFFER_GUIDANCE);
  } else if (unapprovedForm) {
    // The form exists on the forms app but isn't chat-approved: answer from
    // context and point at the service page — never claim no form exists
    // (NO_FORM_DISCLOSURE would, falsely, for these services).
    prompts.push(UNAPPROVED_FORM_DISCLOSURE);
    if (offerFeedback) prompts.push(FEEDBACK_OFFER_GUIDANCE);
  } else if (noContext) {
    // Retrieval ran and returned nothing grounded: keep guiding the user toward
    // the closest service (ask to clarify) instead of dead-ending. Replaces the
    // misapplied NO_FORM_DISCLOSURE, which assumes there IS context to answer
    // from and would frame a non-existent service as in-person-only (#1099).
    // But once we've already clarified once and retrieval is STILL empty, stop
    // re-asking and admit we can't help (#1176) — a clarified query that still
    // grounds nothing never will.
    prompts.push(
      missClarifyExhausted ? buildCantHelpDisclosure() : buildMissDisclosure(),
    );
  } else {
    prompts.push(NO_FORM_DISCLOSURE);
    if (offerFeedback) prompts.push(FEEDBACK_OFFER_GUIDANCE);
  }
  return prompts;
}
