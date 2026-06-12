import { resetSessionForNewForm, type FormSession } from "./session";

// The conversation funnel, written down. The session's ad-hoc fields (slug,
// status, handedOffSlug, offeredForm) encode a state machine that previously
// existed only in scattered guards — this module names the phases and owns
// every transition, so routing logic asks "what phase are we in" instead of
// re-deriving it from four fields (ADR 0048).
export type FunnelPhase =
  | "exploring" // no service settled on yet
  | "offered" // a form offer is on the table, awaiting the user's choice
  | "collecting" // pinned form, gathering fields
  | "submitting"
  | "submitted"
  | "failed"
  | "handed-off"; // link given (or form cancelled) — parked, not pinned

export function funnelPhase(session: FormSession): FunnelPhase {
  if (session.slug) {
    if (session.status === "submitting") return "submitting";
    if (session.status === "submitted") return "submitted";
    if (session.status === "failed") return "failed";
    return "collecting";
  }
  if (session.offeredForm) return "offered";
  if (session.handedOffSlug) return "handed-off";
  return "exploring";
}

// The two offer affordances, shared verbatim between the offer disclosures
// (which prescribe them as present_choices) and the reply matcher below —
// the click is a deterministic confirm, not a model interpretation.
export const OFFER_CHOICE_FILL = "Fill it out with you here";
export const OFFER_CHOICE_LINK = "Just send me the link";

// --- transitions ----------------------------------------------------------

// A fresh form takes over the session (matcher pin, or an accepted offer).
export function pinForm(session: FormSession, slug: string): void {
  if (session.slug !== slug) resetSessionForNewForm(session);
  session.slug = slug;
  session.offeredForm = undefined;
  session.updatedAt = Date.now();
}

// Link given (or collection abandoned): nothing in progress, but the slug is
// parked so the rolling-window matcher and the RAG fallback don't re-surface
// the same form turn after turn. A LATEST message naming it re-engages.
export function parkHandoff(session: FormSession, slug: string | null): void {
  session.slug = null;
  session.offeredForm = undefined;
  session.handedOffSlug = slug;
  session.updatedAt = Date.now();
}

// RAG found a collect-capable form: put the offer on the table. The next
// turn's reply decides; any unrelated reply lets it lapse.
export function offerForm(
  session: FormSession,
  offer: { slug: string; title: string },
): void {
  session.offeredForm = offer;
  session.updatedAt = Date.now();
}

export type OfferReply =
  | { kind: "accepted"; slug: string }
  | { kind: "link"; slug: string; title: string }
  | null;

// Resolve a pending offer against the user's latest message. The choice pills
// send their label verbatim, so accept/link are exact string matches — code,
// not model judgment. Anything else lapses the offer (the user moved on;
// stale-bubble clicks are already disabled client-side) and falls through to
// normal routing, where a fresh match can re-offer.
export function consumeOfferReply(
  session: FormSession,
  latest: string,
): OfferReply {
  const offer = session.offeredForm;
  if (!offer) return null;
  session.offeredForm = undefined;
  session.updatedAt = Date.now();
  const reply = latest.trim().toLowerCase();
  if (reply === OFFER_CHOICE_FILL.toLowerCase()) {
    pinForm(session, offer.slug);
    return { kind: "accepted", slug: offer.slug };
  }
  if (reply === OFFER_CHOICE_LINK.toLowerCase()) {
    parkHandoff(session, offer.slug);
    return { kind: "link", slug: offer.slug, title: offer.title };
  }
  return null;
}

// The title matcher tied across several forms: put them on the table as
// disambiguation choices (#1296). The next turn's tap resolves them.
export function offerDisambiguation(
  session: FormSession,
  candidates: Array<{ slug: string; title: string }>,
): void {
  session.disambiguationForms = candidates;
  session.updatedAt = Date.now();
}

export type DisambiguationChoice =
  | { kind: "pinned"; slug: string }
  | { kind: "lapsed" } // had candidates, but the reply matched no title
  | null; // nothing was pending

// Resolve a pending disambiguation against the user's latest message. Like the
// offer pills, the choice sends its title verbatim, so an exact title match is
// a deterministic pin — NOT a re-run of the margin matcher, which would re-tie
// on the shared-token variants ("redirect mail" → personal/individual/deceased)
// and loop forever. Anything else ("Something else", a topic switch) LAPSES:
// the caller must then match the LATEST message only, because the rolling
// window still names the ambiguous phrase and would just re-offer the same set.
export function consumeDisambiguationChoice(
  session: FormSession,
  latest: string,
): DisambiguationChoice {
  const candidates = session.disambiguationForms;
  if (!candidates?.length) return null;
  session.disambiguationForms = undefined;
  session.updatedAt = Date.now();
  const reply = latest.trim().toLowerCase();
  const hit = candidates.find((c) => c.title.trim().toLowerCase() === reply);
  if (!hit) return { kind: "lapsed" };
  pinForm(session, hit.slug);
  return { kind: "pinned", slug: hit.slug };
}

// Track consecutive retrieval misses so the assistant clarifies ONCE, then
// discloses it can't help instead of re-asking turn over turn (#1176). A miss
// increments the streak; any non-miss turn resets it. The FIRST miss returns
// clarifyExhausted=false (ask one clarifying question); the SECOND and any
// later consecutive miss return true (route to the can't-help disclosure,
// never back to clarify). Code-derived, like the rest of the funnel — the
// model only executes the chosen disclosure.
export function recordMissOutcome(
  session: FormSession,
  noContext: boolean,
): { clarifyExhausted: boolean } {
  const next = noContext ? (session.consecutiveMisses ?? 0) + 1 : 0;
  session.consecutiveMisses = next;
  session.updatedAt = Date.now();
  return { clarifyExhausted: noContext && next >= 2 };
}

// User abandons an in-progress application (the cancel_form tool): collected
// values are DISCARDED immediately — "cancelled" must not leave a draft
// lingering in memory — and the slug is parked for the same re-surface
// suppression a handoff gets.
export function cancelForm(session: FormSession): void {
  const cancelled = session.slug;
  resetSessionForNewForm(session);
  session.handedOffSlug = cancelled;
  session.updatedAt = Date.now();
}
