import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEEDBACK_COLLECTION_GUIDANCE,
  FORM_COLLECTION_PROTOCOL,
  SYSTEM_PROMPT,
  buildCantHelpDisclosure,
  buildDirectLinkDisclosure,
  buildHandoffContinuationDisclosure,
  buildHandoffDisclosure,
  buildHandoffOfferDisclosure,
  buildMissDisclosure,
} from "./prompts";

// The form-collection / submit machinery lives in FORM_COLLECTION_PROTOCOL,
// injected only on active-form turns — NOT in the always-on SYSTEM_PROMPT.
// Guards against it creeping back into every turn (the overloading concern).
// The bespoke ILLEGITIMATE REQUESTS section was removed for the same reason —
// fraud declines lean on the base model; the eval `refusal` cases are the
// canary that tells us if that stops being enough.
test("form-collection rules are out of the always-on system prompt", () => {
  assert.ok(!/set_field|submit_form|FORM COLLECTION:/.test(SYSTEM_PROMPT));
  // but the conversational grounding rules stay always-on
  assert.match(SYSTEM_PROMPT, /CONTEXT USE/);
});

// The CHANNEL PREFERENCE section nudges informational turns online-first, but
// only WHEN the retrieved context shows an online path — it must stay silent /
// in-person for services with no online option, so it can't fight
// NO_FORM_DISCLOSURE or invent a path that isn't in the context (#1079).
test("system prompt nudges online-first, conditioned on the context", () => {
  assert.match(SYSTEM_PROMPT, /CHANNEL PREFERENCE|ONLINE FIRST/);
  // The nudge is gated on the context actually showing an online option...
  assert.match(
    SYSTEM_PROMPT,
    /context shows.*online|when.*online.*(exists|context)/i,
  );
  // ...and it must NOT invent an online path when the context has none.
  assert.match(SYSTEM_PROMPT, /no online option|don't invent an online/i);
});

// STRICT RAG recovery (#1099): a retrieval miss must not dead-end. The
// grounding rule still forbids inventing facts/services, but the recovery half
// now actively guides — name what was found, or ask a clarifying question —
// rather than stopping at a bare decline.
test("system prompt: a retrieval miss guides forward instead of hard-stopping", () => {
  assert.match(SYSTEM_PROMPT, /CONTEXT USE|STRICT RAG/);
  assert.match(SYSTEM_PROMPT, /never hard-stop/i);
  assert.match(SYSTEM_PROMPT, /clarifying question/i);
  // The no-invented-services guarantee stays explicit.
  assert.match(SYSTEM_PROMPT, /invent a service/i);
});

// buildMissDisclosure replaces the misapplied NO_FORM_DISCLOSURE on a genuine
// no-context turn (retrieval attempted, zero citations). It must keep guiding:
// ask a clarifying question, invent nothing, and NOT fabricate a "no online
// form" / paper conclusion it has no basis for.
test("miss disclosure: asks to clarify, invents nothing, doesn't fabricate a paper route", () => {
  const out = buildMissDisclosure();
  // Keeps guiding rather than dead-ending.
  assert.match(out, /clarifying question/i);
  assert.match(out, /DO NOT DEAD-END|nowhere to go/i);
  // Never invents a service it can't see in context.
  assert.match(out, /invent|guess a service/i);
  // Doesn't claim it knows there's no online form — it doesn't know the service.
  assert.match(out, /don't know yet|simply don't know/i);
});

// After ONE clarifying question on a miss, a still-empty retrieval means a
// clarified query won't help — stop re-asking and disclose we can't help
// (#1176). The disclosure must NOT pose another clarifying question, must
// invent nothing, and must end by asking if there's anything else so a "no"
// flows into the existing closer + feedback path.
test("can't-help disclosure: stops clarifying, invents nothing, asks anything-else", () => {
  const out = buildCantHelpDisclosure();
  // It clearly says it can't help with this rather than guiding further.
  assert.match(out, /can't help|cannot help/i);
  // It must NOT ask another clarifying question — that's the loop we're ending.
  assert.match(out, /do not ask (another|a) clarifying question/i);
  // Never invents a service / fee / step it can't see.
  assert.match(out, /invent|guess/i);
  // No fabricated paper / in-person conclusion.
  assert.match(out, /paper|in person|in-person/i);
  // Ends by inviting a next request, with the exact wording the closer path
  // (WRAP_UP_RE = /anything else/i) recognises so a "no" winds the chat down.
  assert.match(out, /Anything else I can help with\?/);
});

// On a successful feedback submit the model must thank the user and NOT recite
// a reference number — the generic protocol's "report the referenceNumber
// verbatim" rule would otherwise leak a permit-style reference onto a 30-second
// feedback form. The guidance both names the thank-you and forbids the
// reference, since it is the more specific instruction injected on feedback
// turns.
test("feedback guidance: a successful submit thanks the user with no reference number", () => {
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /submit_form/);
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /thank/i);
  assert.match(FEEDBACK_COLLECTION_GUIDANCE, /reference number/i);
  assert.match(
    FEEDBACK_COLLECTION_GUIDANCE,
    /no reference number|never.*reference|without.*reference/i,
  );
});

test("FORM_COLLECTION_PROTOCOL carries the collection + submit rules", () => {
  assert.match(FORM_COLLECTION_PROTOCOL, /set_field/);
  assert.match(FORM_COLLECTION_PROTOCOL, /submit_form/);
  assert.match(FORM_COLLECTION_PROTOCOL, /WHEN A FORM SCHEMA IS PROVIDED/);
});

// Guardrail against the model inventing a validation failure on an
// already-recorded field (the "aaaaa first name is invalid" bug after a
// middle-name skip): a {ok:true} value is valid, and only a real {ok:false}
// error this turn is a validation problem.
test("FORM_COLLECTION_PROTOCOL forbids inventing validation errors", () => {
  assert.match(FORM_COLLECTION_PROTOCOL, /TRUST THE TOOL RESULTS/);
  assert.match(FORM_COLLECTION_PROTOCOL, /\{ok: false, error\}/);
});

// The model must never point users at option buttons shown earlier in the chat
// ("select one of the options above") — they may have scrolled off. For a
// required question the user hasn't answered, it must re-render the options via
// ask_field instead of describing them in prose (#1223 / follow-up directive).
test("FORM_COLLECTION_PROTOCOL forbids referencing options above and re-shows them", () => {
  assert.match(
    FORM_COLLECTION_PROTOCOL,
    /options above|buttons above|shown (earlier|above)/i,
  );
  assert.match(FORM_COLLECTION_PROTOCOL, /re-?show|re-?present|show .* again/i);
  assert.match(FORM_COLLECTION_PROTOCOL, /required/i);
});

// The continuation disclosure is shown on follow-up turns after a handoff. It
// must keep the form link in front of the user while preventing the two failure
// modes we saw on the post-handoff turn: hallucinated inline collection, and
// falsely claiming there is no online form.

const TITLE = "Apply for a Conductor Licence";
const URL = "https://forms.example/forms/apply-for-conductor-licence";

test("embeds the form link as a markdown link", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.ok(
    out.includes(`[${TITLE}](${URL})`),
    "should contain the markdown link",
  );
});

test("forbids inline collection", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /collecting field values|what's your first name/i);
  assert.match(out, /set_field/);
});

test("forbids denying the online form exists", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /no online form/i);
  assert.match(out, /in person/i);
});

test("allows informational answering from context", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /informational|informationally/i);
});

// Like the first handoff, the continuation closes by asking if there's anything
// else, using the exact WRAP-UP wording the closer path recognises.
test("continuation: ends by asking if there's anything else", () => {
  const out = buildHandoffContinuationDisclosure(TITLE, URL);
  assert.match(out, /Anything else I can help with\?/);
});

// The OFFER disclosure is shown when the user asked an INFO question about a
// handoff service (e.g. "what does it cost and where do I apply?"). It must
// answer the question and offer the link in prose — but NOT paste a URL this
// turn (that's what keeps these off the "pushed a form" failure).
test("offer disclosure answers first, then offers the link", () => {
  const out = buildHandoffOfferDisclosure(TITLE);
  assert.match(out, /answer/i);
  assert.match(out, /offer the link|share the application link/i);
});

test("offer disclosure forbids pasting a URL or link this turn", () => {
  const out = buildHandoffOfferDisclosure(TITLE);
  assert.match(out, /no links at all|do not paste a url|paste a url/i);
  // It takes no URL argument and must not embed one.
  assert.ok(!/https?:\/\//.test(out), "offer disclosure must contain no URL");
});

// The handoff disclosure is the first reply that hands the user the form link.
// Issue #1065: the copy must read warm and supportive, not curt, while keeping
// the link-prominent shape and the guardrails that stop the #965 drift
// (skipping the link, hallucinating inline collection). #1079 follow-up: it no
// longer forbids the in-person / paper route, so both paths can be shown.

test("handoff: embeds the form link as a markdown link", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.ok(
    out.includes(`[${TITLE}](${URL})`),
    "should contain the markdown link",
  );
});

test("handoff: uses warm, supportive phrasing", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /get started/i);
  // The old curt line must be gone.
  assert.doesNotMatch(out, /you'll need to complete it there/i);
});

test("handoff: guides on prerequisites from context", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /prerequisite|need|bring|handy/i);
});

test("handoff: keeps the anti-drift guardrails", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  // No offering to fill it in for them.
  assert.match(out, /start it for you|fill it in for you/i);
  // Field tools stay forbidden this turn.
  assert.match(out, /set_field/);
  // The link is the online form, so no "ready to start" prompt.
  assert.match(out, /ready to start/i);
});

test("handoff: copy the model reproduces is free of em/en dashes", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.doesNotMatch(
    out,
    /[—–]/,
    "no em/en dashes anywhere in the disclosure",
  );
});

test("handoff: uses the reshaped lead-in + closing copy", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /Here's the form to get started:/);
  assert.match(out, /complete your application there when you're ready/i);
});

// The "just send me the link" path delivers the link and, like the handoff,
// closes by asking if there's anything else so a "no" is recognised by the
// closer path (retrieval's WRAP_UP_RE) and winds the chat down.
test("direct link: delivers the link and ends by asking if there's anything else", () => {
  const out = buildDirectLinkDisclosure(TITLE, URL);
  assert.ok(out.includes(`[${TITLE}](${URL})`), "should contain the link");
  assert.match(out, /Anything else I can help with\?/);
});

// Handing over the link must not dead-end the chat: the reply ends by asking if
// there's anything else, using the exact WRAP-UP wording the closer path
// (retrieval's WRAP_UP_RE = /anything else/i) recognises so a "no" winds down.
test("handoff: ends by asking if there's anything else", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  assert.match(out, /Anything else I can help with\?/);
});

// #1079 follow-up: we now show BOTH paths. The disclosure must no longer forbid
// the paper / in-person route, and must explicitly allow it as a fallback after
// the online link.
test("handoff: allows the in-person / paper fallback instead of forbidding it", () => {
  const out = buildHandoffDisclosure(TITLE, URL);
  // The old prohibition is gone.
  assert.doesNotMatch(out, /recite the paper-form path/i);
  // Both paths are explicitly permitted, online still leading.
  assert.match(out, /BOTH PATHS/);
  assert.match(out, /in person|in-person/i);
});
