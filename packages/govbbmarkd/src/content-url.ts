const SAFE_PROTOCOL = /^(https?|ircs?|mailto|tel|xmpp):/i;
const EXPLICIT_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;

/** Accepts relative content URLs and approved protocols; it does not sanitize HTML. */
export function isSafeContentUrl(value: string): boolean {
  const url = value.trim();
  const hasControlCharacter = [...url].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!url || hasControlCharacter) return false;
  return !EXPLICIT_PROTOCOL.test(url) || SAFE_PROTOCOL.test(url);
}
