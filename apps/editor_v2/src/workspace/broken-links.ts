import { collectInternalPageLinks, type InternalPageLink } from "../pages/link-checks";
import { govbbPageCodec } from "../presets/govbb-page";

/** A link's address as the link check names pages: a pathname without a trailing slash. */
export const linkTarget = (url: string) =>
  new URL(url, "https://www.gov.bb").pathname.replace(/\/+$/, "") || "/";

/** The pages to look up, each once. */
export const linkTargets = (links: readonly InternalPageLink[]) => [
  ...new Set(links.map((link) => link.target)),
];

/** The links to a page the site doesn't have. A page may link to itself. */
export function brokenLinks(
  links: readonly InternalPageLink[],
  known: readonly string[],
  pageUrl: string,
) {
  const pages = new Set([...known, linkTarget(pageUrl)]);

  return links.filter((link) => !pages.has(link.target));
}

/** The internal links in a page's Markdown, such as a change under review; undefined when it can't be read. */
export function linksInMarkdown(markdown: string, pageUrl: string) {
  try {
    const prepared = govbbPageCodec.prepare(markdown);

    return prepared.mode === "visual"
      ? collectInternalPageLinks(prepared.state, pageUrl)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a publish confirmation says about the links, or undefined when there is nothing to say. Pages that couldn't be
 * listed are never called missing: the words say the check wasn't possible.
 */
export function linkConfirmation(broken: readonly InternalPageLink[], unavailable: boolean) {
  if (unavailable)
    return {
      title: "Publish without checking links?",
      message: "We could not check this page’s links, so some may not work. Your changes are kept.",
    };

  if (!broken.length) return undefined;

  const names = broken.map((link) => `“${link.text}”`).join(", ");

  return {
    title: "Publish with broken links?",
    message:
      broken.length === 1
        ? `This link goes to a page that doesn’t exist: ${names}.`
        : `These links go to pages that don’t exist: ${names}.`,
  };
}
