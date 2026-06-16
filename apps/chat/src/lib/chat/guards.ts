// Cheap synchronous deny-list for the obvious script-kiddie attempts. Claude
// already refuses sophisticated jailbreaks; this catches the lazy "ignore
// previous instructions" / "you are now DAN" / system-prompt-dump requests
// before the model is ever invoked, so they get an instant, deterministic
// redirect. (Off-topic / out-of-scope questions are handled by grounding
// abstention, not here — no separate scope deny-list.)
const JAILBREAK_PATTERNS: ReadonlyArray<RegExp> = [
  // Qualifiers repeat (*) so "ignore all previous instructions" — the canonical
  // phrasing, with two qualifiers — matches.
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
