export function isSafeLinkUrl(value: string) {
  return (
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) && !/^(?:javascript|data|vbscript):/i.test(value.trim())
  );
}

export function isSupportedLinkUrl(value: string) {
  return (
    ![...value].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) &&
    !value.startsWith("//") &&
    (!/^[a-z][a-z\d+.-]*:/i.test(value) || /^(https?|mailto|tel|ircs?|xmpp):/i.test(value))
  );
}

// A scheme, or a path from the site's root, the page, a fragment or a query
const schemeOrPath = /^([a-z][a-z\d+.-]*:|[/#?])/i;

// A host needs a dot or to be localhost, so that a scheme such as tel: isn't read as a host and port
const hostWithPort = /^(?:localhost|[a-z\d-]+(?:\.[a-z\d-]+)+):\d+(?:[/?#]|$)/i;

// ./ or ../, or a slash before the first dot, as in docs/guide.pdf
const relativePath = /^(?:\.{1,2}\/|[^./]+\/)/;

const email = /^[^\s@/:]+@[^\s@/]+\.[^\s@/]{2,}$/;

// Seven digits at least, with the separators people type: +1 (246) 535-1000
const phone = /^\+?[\d\s().-]+$/;

const domain = /^\S+\.\S{2,}$/;

/** The address a typed link means, where the link policy (`isValidLink`) allows it; otherwise null. */
export function linkAddress(typed: string, isValidLink: (url: string) => boolean) {
  const url = normalizeLinkUrl(typed);

  return url && isValidLink(url) ? url : null;
}

/**
 * What a writer types as a link, as the address it means. An email address gets mailto:, a phone number tel: and a
 * bare domain or host https://, so none of them becomes a link relative to the page it's on. A scheme or a relative
 * path stays as typed.
 */
export function normalizeLinkUrl(value: string) {
  const trimmed = value.trim();

  if (hostWithPort.test(trimmed)) return `https://${trimmed}`;

  if (schemeOrPath.test(trimmed) || relativePath.test(trimmed)) return trimmed;

  if (email.test(trimmed)) return `mailto:${trimmed}`;

  if (phone.test(trimmed) && trimmed.replace(/\D/g, "").length >= 7)
    return `tel:${trimmed.replace(/[\s().-]/g, "")}`;

  return domain.test(trimmed) ? `https://${trimmed}` : trimmed;
}
