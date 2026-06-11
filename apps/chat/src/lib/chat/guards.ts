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

// A user who TYPES an intent to give feedback ("I want to give feedback",
// "i wan to feedback", "let me leave some feedback") should go straight into
// the chat-feedback form — exactly as the notice banner's link does — instead
// of being asked a redundant "would you like to give feedback?" first. The
// banner sends an EXACT phrase (FEEDBACK_TRIGGER_PHRASE) that pinSessionForm
// matches; this catches the free-typed variants the exact match misses.
//
// Deliberately TIGHT (statement intent only): the caller gates on
// !isInfoQuestion, so question-shaped asks ("can I give feedback?", "what
// happens to my feedback?") fall through to the model's normal handling rather
// than starting the form on someone who is only asking ABOUT feedback.
const FEEDBACK_REQUEST_PATTERNS: ReadonlyArray<RegExp> = [
  // A give-style verb landing on "feedback": "give/leave/provide/send/share/
  // submit/offer (some) feedback". Allows a few words between for "give you
  // some feedback", "leave a bit of feedback".
  /\b(give|giving|leave|leaving|provide|providing|send|sending|share|sharing|submit|submitting|offer|offering)\b[\w\s']{0,20}\bfeedback\b/i,
  // A desire phrasing where "feedback" is itself used as the verb, so there is
  // no give-word — "i want to feedback", "i wan to feedback" (typo), "i'd like
  // to feedback", "wanna feedback". "wan(?:t(?:ed)?|na)?" covers wan / want /
  // wanted / wanna so the transcript typo "i wan to feedback" still lands.
  /\b(wan(?:t(?:ed)?|na)?|wish|'d like|would like|like to|love to)\b[\w\s']{0,12}\bfeedback\b/i,
];

export function isFeedbackRequest(input: string): boolean {
  const t = input.trim();
  if (!t) return false;
  return FEEDBACK_REQUEST_PATTERNS.some((re) => re.test(t));
}
