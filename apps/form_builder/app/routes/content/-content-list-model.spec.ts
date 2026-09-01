import {
  groupContentReviews,
  mergeReviewedContentPages,
} from "./-content-list-model";
import type { ContentPageSummary, ContentReviewSnapshot } from "./-server";

const basePage: ContentPageSummary = {
  path: "apps/landing/src/content/licences/existing.md",
  title: "Existing licence",
  category: "business",
  visibility: "public",
  formId: "existing-licence",
  hasFormButton: true,
};

function review(
  overrides: Partial<ContentReviewSnapshot["claims"][number]> = {},
): ContentReviewSnapshot["claims"][number] {
  return {
    path: "apps/landing/src/content/licences/new.md",
    changeType: "added",
    prNumber: 2450,
    prUrl: "https://github.com/govtech-bb/gov-bb/pull/2450",
    branch: "start-page-licences-new-123",
    headSha: "head-1",
    writable: true,
    summary: {
      path: "apps/landing/src/content/licences/new.md",
      title: "New licence",
      category: "business",
      visibility: "draft",
      formId: "new-licence",
      hasFormButton: true,
    },
    ...overrides,
  };
}

describe("review-aware content inventory", () => {
  it("adds a page that exists only on an open PR", () => {
    const snapshot: ContentReviewSnapshot = {
      claims: [review()],
      complete: true,
    };

    expect(mergeReviewedContentPages([basePage], snapshot)).toEqual([
      basePage,
      review().summary,
    ]);
  });

  it("uses the PR summary for a modified base page", () => {
    const changed = review({
      path: basePage.path,
      changeType: "modified",
      summary: { ...basePage, title: "Updated licence" },
    });

    expect(
      mergeReviewedContentPages([basePage], {
        claims: [changed],
        complete: true,
      }),
    ).toEqual([{ ...basePage, title: "Updated licence" }]);
  });

  it("keeps a removal visible but does not invent a removed page", () => {
    const removed = review({
      path: basePage.path,
      changeType: "removed",
      summary: undefined,
      writable: false,
    });

    expect(
      mergeReviewedContentPages([basePage], {
        claims: [removed],
        complete: true,
      }),
    ).toEqual([basePage]);
  });

  it("adds a read-only placeholder when a fork's page metadata is unavailable", () => {
    const fork = review({ summary: undefined, writable: false });

    expect(
      mergeReviewedContentPages([], {
        claims: [fork],
        complete: true,
      }),
    ).toEqual([
      expect.objectContaining({ path: fork.path, title: "", formId: "" }),
    ]);
  });

  it("keeps every claim when two PRs touch the same path", () => {
    const claims = [review(), review({ prNumber: 2451, branch: "other" })];
    const grouped = groupContentReviews(claims);

    expect(grouped.get(review().path)?.map((claim) => claim.prNumber)).toEqual([
      2450, 2451,
    ]);
    expect(
      mergeReviewedContentPages([], { claims, complete: true }).map(
        (page) => page.path,
      ),
    ).toEqual([review().path]);
  });
});
