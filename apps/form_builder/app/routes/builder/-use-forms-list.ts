import { useCallback, useEffect, useState } from "react";
import { listForms } from "../../server/forms";
import type { BuilderFormSummary } from "../../types/index";

export interface FormsListState {
  /** The published/draft forms, or `null` while the mount fetch is in flight. */
  forms: BuilderFormSummary[] | null;
  /** A message if the mount fetch failed, otherwise `null`. */
  loadError: string | null;
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

  // `isActive` lets the mount effect drop a resolution that lands after unmount;
  // a manual refetch passes the default (always-active) guard.
  const load = useCallback((isActive: () => boolean = () => true) => {
    setLoadError(null);
    listForms()
      .then((result) => {
        if (isActive()) setForms(result);
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

  return { forms, loadError, refetch: () => load(), upsertForm };
}
