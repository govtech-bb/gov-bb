import { useCallback, useEffect, useState } from "react";
import {
  listLandingContentPages,
  listOpenContentPRs,
  type ContentPageSummary,
  type ContentReviewClaim,
  type ContentReviewSnapshot,
} from "./-server";
import {
  groupContentReviews,
  mergeReviewedContentPages,
} from "./-content-list-model";

export interface ContentListState {
  pages: ContentPageSummary[] | null;
  /** Every review claim keyed by path; ambiguity is preserved, never collapsed. */
  openPRs: Map<string, ContentReviewClaim[]>;
  reviewSnapshot: ContentReviewSnapshot;
  loading: boolean;
  loadError: string | null;
  reviewError: string | null;
  refetch: () => void;
}

/**
 * Fetches the landing content page list (+ open PRs) when first enabled. Logic
 * mirrors the builder's `useFormsList`; the list is the CMS's Open picker, so
 * it loads lazily the first time the picker opens.
 */
export function useContentList(enabled: boolean): ContentListState {
  const [pages, setPages] = useState<ContentPageSummary[] | null>(null);
  const [openPRs, setOpenPRs] = useState<Map<string, ContentReviewClaim[]>>(
    new Map(),
  );
  const [reviewSnapshot, setReviewSnapshot] = useState<ContentReviewSnapshot>({
    claims: [],
    complete: false,
  });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const load = useCallback(
    (isActive: () => boolean = () => true, force = false) => {
      setLoading(true);
      setLoadError(null);
      setReviewError(null);
      // A refresh invalidates the old review proof immediately. Writes stay
      // disabled until the new snapshot finishes, even if an earlier snapshot
      // had been complete.
      setReviewSnapshot((current) => ({ ...current, complete: false }));
      Promise.all([
        listLandingContentPages({ data: { force } }),
        listOpenContentPRs().catch(
          (): ContentReviewSnapshot => ({
            claims: [],
            complete: false,
            warning: "Open pull requests could not be checked.",
          }),
        ),
      ])
        .then(([list, snapshot]) => {
          if (!isActive()) return;
          setPages(mergeReviewedContentPages(list, snapshot));
          setReviewSnapshot(snapshot);
          setOpenPRs(groupContentReviews(snapshot.claims));
          if (!snapshot.complete) {
            setReviewError(
              snapshot.warning ?? "Open pull requests could not be checked.",
            );
          }
        })
        .catch((e) => {
          if (isActive()) {
            setLoadError(
              e instanceof Error ? e.message : "Failed to load pages",
            );
          }
        })
        .finally(() => {
          if (isActive()) setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    if (!enabled || pages !== null) return;
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [enabled, pages, load]);

  return {
    pages,
    openPRs,
    reviewSnapshot,
    loading,
    loadError,
    reviewError,
    /** Force a fresh fetch, bypassing the server-side 60s cache. */
    refetch: () => load(() => true, true),
  };
}
