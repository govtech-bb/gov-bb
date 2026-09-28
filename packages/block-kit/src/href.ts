/**
 * Which hrefs a document is allowed to produce.
 *
 * Every link on these pages comes from the document body, which comes from
 * an author. React does not sanitise `href` — it warns about `javascript:`
 * and then renders it anyway — so an author who can save a body can save a
 * link that runs script on a citizen-facing page. That is stored XSS, and
 * `block-kit` is the part of this spike meant to outlive it, so the guard
 * belongs here rather than in one call site.
 *
 * Allowed: root-relative paths, fragments, and the four schemes government
 * content actually uses. Everything else — `javascript:`, `data:`,
 * `vbscript:`, `blob:`, `file:` — is refused.
 *
 * Two subtleties a naive `startsWith("javascript:")` check misses:
 *
 * - HTML parsers strip control characters and whitespace from inside a
 *   scheme, so `java<TAB>script:alert(1)` and a leading-space
 *   ` javascript:alert(1)` both run. The scheme is therefore decided on a
 *   stripped copy.
 * - `//evil.example` is protocol-relative: a path to the eye, another
 *   origin in fact.
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

const DEL = 0x7f;
const SPACE = 0x20;

/**
 * Drop everything a parser would drop before resolving the scheme — the C0
 * controls, space, and DEL.
 *
 * Done by code point rather than a regex character class so the source
 * carries no literal control characters of its own.
 */
function stripIgnorable(raw: string): string {
  return [...raw]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > SPACE && code !== DEL;
    })
    .join("");
}

/** The href to render, or null when it must not be emitted at all. */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const stripped = stripIgnorable(raw);
  if (stripped === "") return null;

  if (stripped.startsWith("//")) return null;

  if (stripped.startsWith("/") || stripped.startsWith("#")) return raw.trim();

  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(stripped)?.[1];
  // No scheme and not root-relative: a bare word is an authoring mistake,
  // not a link, and resolving it against whatever page it lands on is worse
  // than refusing it.
  if (!scheme) return null;

  return ALLOWED_SCHEMES.has(scheme.toLowerCase()) ? raw.trim() : null;
}

export function isSafeHref(raw: string | null | undefined): boolean {
  return safeHref(raw) !== null;
}

/**
 * Spread onto an anchor: `{ href }` when the link is allowed, `{}` when it
 * is not. An anchor with no href is inert and stops being a link, which is
 * the right failure — better a visibly dead control than a working one that
 * runs script.
 */
export function hrefAttr(raw: string | null | undefined): { href?: string } {
  const href = safeHref(raw);
  return href ? { href } : {};
}
