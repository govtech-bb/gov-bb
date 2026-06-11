// Cheap synchronous deny-list for the obvious script-kiddie attempts.
// Claude already refuses sophisticated jailbreaks; this catches the lazy
// "ignore previous instructions" / "you are now DAN" / system-prompt-dump
// requests without an extra LLM round-trip.
const JAILBREAK_PATTERNS: ReadonlyArray<RegExp> = [
  // Qualifiers repeat (*) so "ignore all previous instructions" — the canonical
  // phrasing, with TWO qualifiers — matches; the old single-optional-group
  // version missed it (caught by guards.test.ts when this moved out of
  // run-turn.ts).
  /ignore (all |previous |your |the |prior )*(instructions|rules|guidelines)/i,
  /you are (now )?(DAN|a different AI|jailbroken)/i,
  /(reveal|show|print|repeat).{0,20}(system prompt|your instructions|your rules)/i,
  /pretend (you|that you).{0,20}(have no|don't have).{0,20}(rules|restrictions)/i,
  /disregard (all |previous |your |the |prior )*(instructions|rules)/i,
];

export function looksLikeJailbreak(input: string): boolean {
  if (!input || input.length < 6) return false;
  return JAILBREAK_PATTERNS.some((re) => re.test(input));
}

// Does the message read as an information-seeking question rather than intent to
// apply? Decides whether a matched form answers + offers (info) or enters field
// collection (apply). A plain first-word list (not a pattern catalogue) keeps it
// maintainable; bias is toward "info" — when unsure, answer the question and
// offer the form rather than railroad the user into field prompts.
const QUESTION_OPENERS: ReadonlySet<string> = new Set([
  "what",
  "how",
  "where",
  "when",
  "why",
  "who",
  "which",
  "whose",
  "can",
  "could",
  "do",
  "does",
  "did",
  "is",
  "are",
  "will",
  "would",
  "should",
  "may",
  "whats",
  "hows",
]);

export function isInfoQuestion(input: string): boolean {
  const t = input.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith("?")) return true;
  const firstWord = t.split(/[\s'.,]+/)[0];
  return QUESTION_OPENERS.has(firstWord);
}

// Does the message express wanting to GIVE feedback (on the assistant, a
// service, or the site) — as opposed to an ordinary service question that
// merely contains the word? Drives the deterministic "about the assistant /
// about a service" disambiguation in run-turn. Deliberately conservative: keyed
// on a giving cue (or a platform-directed / complaint phrasing), so a question
// like "how do I get a birth certificate?" never trips it.
//
// This is the single feedback-intent detector. It SUPERSEDES the earlier
// isFeedbackRequest (#1247), which pinned chat-feedback directly on a typed
// request: a typed request now shows the assistant/service disambiguation
// instead (so service feedback can reach the general feedback form), and the
// "About this assistant" tap reaches the same in-chat form one step later. The
// banner trigger phrase also matches here (it IS feedback intent) — run-turn
// excludes it by exact match so the notice banner keeps pinning chat-feedback
// directly (#1206).
const FEEDBACK_INTENT_PATTERNS: ReadonlyArray<RegExp> = [
  // a verb of GIVING + (anything but sentence end) + "feedback":
  // give/leave/submit/send/share/provide/offer/have … feedback. Deliberately
  // excludes get/got/receive — "get feedback on my exam results" is RECEIVING
  // feedback (an ordinary service question), not offering it.
  /\b(give|giving|gave|leave|leaving|left|submit|submitting|send|sending|share|sharing|provide|providing|offer|offering|have|having|had)\b[^.?!]*\bfeedback\b/i,
  // "feedback" used as the verb after a desire phrasing, so there is no
  // give-word — "i want to feedback", "i wan to feedback" (the #1247 transcript
  // typo), "i'd like to feedback", "wanna feedback". Requires the infinitive
  // "to" (or bare "wanna") so the RECEIVE noun-object case "i want feedback on
  // my results" — no "to" — is NOT caught.
  /\b(want|wanna|wan|wish|'d like|would like|like|love)\s+to\s+feedback\b/i,
  /\bwanna\s+feedback\b/i,
  // feedback directed AT the platform: "feedback about/on/for (the|this|your)
  // service/site/chat/assistant/…". The article test is the give-vs-receive
  // tell — "the/this/your service" is platform feedback, whereas "my exam
  // results / my application" (the receive case) never uses these articles.
  /\bfeedback\s+(about|on|for|regarding|re)\s+(the\s+|this\s+|your\s+)?(service|services|site|website|chat|chatbot|assistant|alpha|portal|page|platform|experience)\b/i,
  // a complaint specifically about the service / site / assistant.
  /\b(complain|complaint)\b[^.?!]*\b(service|site|website|assistant|chat|alpha)\b/i,
];

export function looksLikeFeedbackIntent(input: string): boolean {
  const t = input?.trim();
  if (!t || t.length < 4) return false;
  return FEEDBACK_INTENT_PATTERNS.some((re) => re.test(t));
}
