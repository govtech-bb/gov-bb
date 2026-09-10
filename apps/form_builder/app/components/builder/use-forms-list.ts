import { useCallback, useEffect, useState } from "react";
import { listForms } from "../../server/forms";
import { listOpenDeployPRs, type OpenDeployPR } from "../../server/publish";
import type { BuilderFormSummary } from "../../types/index";

export interface FormsListState {
  /** The published/draft forms, or `null` while the mount fetch is in flight. */
  forms: BuilderFormSummary[] | null;
  /** A message if the mount fetch failed, otherwise `null`. */
  loadError: string | null;
  /**
   * Open Deploy PRs keyed by the formId each publishes, so the Open picker can
   * badge a row "In review" (#2390). Fetched alongside `listForms()`; a failed
   * lookup degrades to an empty map rather than failing the whole load — see
   * the `.catch` at the call site.
   */
  openPRs: Map<string, OpenDeployPR>;
  /**
   * Re-fetch the list on demand. The route loader no longer owns this data, so
   * router invalidation can't refresh it — the delete-form flow calls this after
   * removing a form so the Open picker drops the deleted entry.
   */
  refetch: () => void;
  /**
   * Patch a single entry in the local list without a server round-trip,
   * replacing the row with the matching `formId` (or appending if absent). The
   * save flow uses this after re-saving an existing form so the picker shows the
   * fresh version/title without paying for the slow `listForms()` waterfall that
   * `refetch()` runs. No-op while the mount fetch is still in flight (`forms`
   * is `null`): there is nothing to patch, and the pending fetch will bring the
   * authoritative list.
   */
  upsertForm: (summary: BuilderFormSummary) => void;
}

/**
 * Fetches the forms list once on mount, off the route's critical load path.
 *
 * The `/builder` loader no longer awaits `listForms()` (a slow, uncached
 * GitHub-API waterfall); the editor paints from the catalog alone and this hook
 * prefetches the list in the background. It is only ever consumed by the Open
 * picker, which by the time it opens usually finds the list already loaded.
 */
export function useFormsList(): FormsListState {
  const [forms, setForms] = useState<BuilderFormSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openPRs, setOpenPRs] = useState<Map<string, OpenDeployPR>>(new Map());

  // `isActive` lets the mount effect drop a resolution that lands after unmount;
  // a manual refetch passes the default (always-active) guard.
  const load = useCallback((isActive: () => boolean = () => true) => {
    setLoadError(null);
    Promise.all([
      listForms(),
      // The PR lookup hits a different backend (GitHub) than the forms list, so
      // a hiccup/rate-limit there must degrade to "no badges", never blank the
      // whole Open picker (#2390) — mirrors content's useContentList.
      listOpenDeployPRs().catch(() => [] as OpenDeployPR[]),
    ])
      .then(([result, prs]) => {
        if (!isActive()) return;
        setForms(result);
        // Sorted ascending so the highest-numbered PR is written last and
        // therefore wins the formId key — the same tie-break
        // findOpenPRByHeadRef applies server-side (#2390). Without it the
        // badge could link to one open Deploy PR while the next Deploy pushes
        // onto a different one.
        setOpenPRs(
          new Map(
            prs
              .slice()
              .sort((a, b) => a.prNumber - b.prNumber)
              .map((pr) => [pr.formId, pr]),
          ),
        );
      })
      .catch((e) => {
        if (isActive()) {
          setLoadError(e instanceof Error ? e.message : "Failed to load forms");
        }
      });
  }, []);

  const upsertForm = useCallback((summary: BuilderFormSummary) => {
    setForms((current) => {
      if (current === null) return current;
      const index = current.findIndex((f) => f.formId === summary.formId);
      if (index === -1) return [...current, summary];
      const next = current.slice();
      next[index] = summary;
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  return { forms, loadError, openPRs, refetch: () => load(), upsertForm };
}
