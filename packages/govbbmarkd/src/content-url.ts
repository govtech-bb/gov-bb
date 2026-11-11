const SAFE_PROTOCOL = /^(https?|ircs?|mailto|tel|xmpp):/i;
const EXPLICIT_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;

// eslint-disable-next-line no-control-regex -- Reject controls before URL parsing discards them.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A root-relative path safe for redirects and site links, checked without normalization. */
export function isSitePath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/\s/.test(value) &&
    !CONTROL_CHARACTERS.test(value)
  );
}

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
