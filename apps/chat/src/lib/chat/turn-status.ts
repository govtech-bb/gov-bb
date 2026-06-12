// Per-turn status label (#1271, GOV.UK Chat's answer-status taxonomy). Every
// model turn already takes exactly one of these branches in run-turn /
// prompt-builder — this just names the branch on the [turn] log record so
// failure modes are chartable (Logs Insights can segment turns by status)
// instead of reconstructable-only-by-reading-prompts.
//
// Deterministic non-model turns (jailbreak block, option clicks, form
// re-triggers, feedback disambiguation pills) return before chat() runs and
// never produce a [turn] record; this taxonomy covers model turns only.

export interface TurnStatusFlags {
  resolutionKind: "collect" | "handoff" | "none";
  offerOnly: boolean;
  feedbackForm: boolean;
  linkRequested: boolean;
  serviceFeedback: boolean;
  handoffContinuation: boolean;
  formOffer: boolean;
  disambiguation: boolean;
  unapprovedForm: boolean;
  closer: boolean;
  noContext: boolean;
  missClarifyExhausted: boolean;
  offerFeedback: boolean;
  citationCount: number;
}

export type TurnStatus =
  | "link-requested"
  | "service-feedback"
  | "handoff"
  | "collect"
  | "collect-feedback"
  | "collect-offer"
  | "handoff-continuation"
  | "form-offer"
  | "disambiguation"
  | "closer"
  | "miss-clarify"
  | "miss-exhausted"
  | "unapproved-form"
  | "feedback-offer"
  | "answered"
  | "smalltalk";

// Precedence mirrors which disclosure dominates the turn's system prompt:
// deterministic link deliveries first, then the active-form modes, then the
// RAG-routing outcomes, then the no-form fallbacks.
export function deriveTurnStatus(f: TurnStatusFlags): TurnStatus {
  if (f.linkRequested) return "link-requested";
  if (f.serviceFeedback) return "service-feedback";
  if (f.resolutionKind === "handoff") return "handoff";
  if (f.resolutionKind === "collect") {
    if (f.offerOnly) return "collect-offer";
    return f.feedbackForm ? "collect-feedback" : "collect";
  }
  if (f.handoffContinuation) return "handoff-continuation";
  if (f.formOffer) return "form-offer";
  if (f.disambiguation) return "disambiguation";
  if (f.closer) return "closer";
  if (f.noContext) {
    return f.missClarifyExhausted ? "miss-exhausted" : "miss-clarify";
  }
  if (f.unapprovedForm) return "unapproved-form";
  if (f.offerFeedback) return "feedback-offer";
  return f.citationCount > 0 ? "answered" : "smalltalk";
}
