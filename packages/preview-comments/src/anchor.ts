/**
 * Anchoring: turning a place on the page into something storable, and back.
 *
 * Two complementary schemes (see `Thread` in types.ts):
 *   - `getSelector` / `resolveSelector` — a CSS path to an element. Drives the
 *     floating pin. Stable for elements with ids; falls back to an
 *     `nth-of-type` path otherwise.
 *   - `captureQuote` / `locateQuote` — a W3C text-quote anchor (the selected
 *     text plus a little surrounding context) for drawing an inline highlight.
 *
 * Kept free of any widget/UI state so it can be unit-tested in isolation.
 */

const CONTEXT_LEN = 32;

/** `CSS.escape`, with a fallback for environments that lack it (e.g. jsdom). */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^\w-]/g, (ch) => `\\${ch}`);
}

/** Build a CSS selector that uniquely addresses `el` within the document. */
export function getSelector(el: Element | null): string | null {
  if (!el || el.nodeType !== 1) return null;
  if (el.id) return `#${cssEscape(el.id)}`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.body) {
    const current: Element = node;
    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = Array.prototype.filter.call(
        parent.children,
        (c: Element) => c.tagName === current.tagName,
      ) as Element[];
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

/** Resolve a selector produced by `getSelector` back to an element. */
export function resolveSelector(selector: string | null): Element | null {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export interface QuoteAnchor {
  quote: string;
  prefix: string;
  suffix: string;
}

/** Capture the current selection's text plus surrounding context, scoped to `root`. */
export function captureQuote(range: Range, root: Element): QuoteAnchor {
  const quote = range.toString();
  const full = root.textContent ?? "";
  const at = full.indexOf(quote);
  if (at < 0) return { quote, prefix: "", suffix: "" };
  return {
    quote,
    prefix: full.slice(Math.max(0, at - CONTEXT_LEN), at),
    suffix: full.slice(at + quote.length, at + quote.length + CONTEXT_LEN),
  };
}

/**
 * Find where a stored quote lives in `root`'s text, returning character
 * offsets into the concatenated text, or `null` if it can't be found.
 * Prefers the prefix+quote+suffix match (disambiguates repeated phrases),
 * then falls back to the bare quote.
 */
export function locateQuote(
  anchor: Pick<QuoteAnchor, "quote" | "prefix" | "suffix">,
  root: Element,
): { start: number; end: number } | null {
  if (!anchor.quote) return null;
  const full = root.textContent ?? "";

  let start = -1;
  if (anchor.prefix || anchor.suffix) {
    const probe = anchor.prefix + anchor.quote + anchor.suffix;
    const at = full.indexOf(probe);
    if (at >= 0) start = at + anchor.prefix.length;
  }
  if (start < 0) start = full.indexOf(anchor.quote);
  if (start < 0) return null;
  return { start, end: start + anchor.quote.length };
}
