import { useCallback, useEffect, useState } from "react";
import {
  listLandingContentPages,
  listOpenContentPRs,
  type ContentPageSummary,
  type OpenContentPR,
} from "./-server";

export interface ContentListState {
  pages: ContentPageSummary[] | null;
  /** Open content PRs keyed by file path, so rows can flag "in review". */
  openPRs: Map<string, OpenContentPR>;
  loading: boolean;
  loadError: string | null;
  refetch: () => void;
}

/**
 * Fetches the landing content page list (+ open PRs) when first enabled. Logic
 * mirrors the builder's `useFormsList`; the list is the CMS's Open picker, so
 * it loads lazily the first time the picker opens.
 */
export function useContentList(enabled: boolean): ContentListState {
  const [pages, setPages] = useState<ContentPageSummary[] | null>(null);
  const [openPRs, setOpenPRs] = useState<Map<string, OpenContentPR>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    (isActive: () => boolean = () => true, force = false) => {
      setLoading(true);
      setLoadError(null);
      Promise.all([
        listLandingContentPages({ data: { force } }),
        listOpenContentPRs().catch(() => [] as OpenContentPR[]),
      ])
        .then(([list, prs]) => {
          if (!isActive()) return;
          setPages(list);
          setOpenPRs(new Map(prs.map((pr) => [pr.path, pr])));
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
    loading,
    loadError,
    /** Force a fresh fetch, bypassing the server-side 60s cache. */
    refetch: () => load(() => true, true),
  };
}
