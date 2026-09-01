import type {
  ContentPageSummary,
  ContentReviewClaim,
  ContentReviewSnapshot,
} from "./-server";

function reviewPlaceholder(path: string): ContentPageSummary {
  return {
    path,
    title: "",
    category: "",
    visibility: "draft",
    formId: "",
    hasFormButton: false,
  };
}

/** Keep every claim for a path: choosing one silently can overwrite a rival PR. */
export function groupContentReviews(
  claims: ContentReviewClaim[],
): Map<string, ContentReviewClaim[]> {
  const grouped = new Map<string, ContentReviewClaim[]>();
  for (const claim of claims) {
    const paths = new Set(
      [claim.path, claim.previousPath].filter((path): path is string =>
        Boolean(path),
      ),
    );
    for (const path of paths) {
      const current = grouped.get(path);
      if (current) current.push(claim);
      else grouped.set(path, [claim]);
    }
  }
  return grouped;
}

/**
 * Build the picker inventory from the live branch plus readable PR versions.
 * A unique addition/modification overlays the base summary; removals stay
 * visible as their live page; ambiguous paths keep the base version.
 */
export function mergeReviewedContentPages(
  basePages: ContentPageSummary[],
  snapshot: ContentReviewSnapshot,
): ContentPageSummary[] {
  const byPath = new Map(basePages.map((page) => [page.path, page]));
  const grouped = groupContentReviews(snapshot.claims);

  for (const [path, claims] of grouped) {
    if (claims.length !== 1) {
      if (!byPath.has(path)) {
        const displayClaim = claims
          .filter((claim) => claim.path === path && claim.summary)
          .sort((a, b) => b.prNumber - a.prNumber)[0];
        if (displayClaim?.summary) byPath.set(path, displayClaim.summary);
        else if (
          claims.some(
            (claim) => claim.path === path && claim.changeType !== "removed",
          )
        ) {
          byPath.set(path, reviewPlaceholder(path));
        }
      }
      continue;
    }
    const claim = claims[0];
    if (claim.path !== path) continue;

    if (claim.changeType === "renamed" && claim.previousPath) {
      byPath.delete(claim.previousPath);
    }
    if (claim.changeType !== "removed" && claim.summary) {
      byPath.set(claim.path, claim.summary);
    } else if (claim.changeType !== "removed" && !byPath.has(claim.path)) {
      byPath.set(claim.path, reviewPlaceholder(claim.path));
    }
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}
