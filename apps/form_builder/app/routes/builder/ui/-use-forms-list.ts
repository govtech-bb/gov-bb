import { useCallback, useEffect, useState } from "react";
import { listForms } from "../../../server/forms";
import type { FormDefinitionSummary } from "../../../types/index";

export interface FormsListState {
  /** The published/draft forms, or `null` while the mount fetch is in flight. */
  forms: FormDefinitionSummary[] | null;
  /** A message if the mount fetch failed, otherwise `null`. */
  loadError: string | null;
  /**
   * Re-fetch the list on demand. The route loader no longer owns this data, so
   * router invalidation can't refresh it — the delete-form flow calls this after
   * removing a form so the Open picker drops the deleted entry.
   */
  refetch: () => void;
}

/**
 * Fetches the forms list once on mount, off the route's critical load path.
 *
 * The `/builder/ui` loader no longer awaits `listForms()` (a slow, uncached
 * GitHub-API waterfall); the editor paints from the catalog alone and this hook
 * prefetches the list in the background. It is only ever consumed by the Open
 * picker, which by the time it opens usually finds the list already loaded.
 */
export function useFormsList(): FormsListState {
  const [forms, setForms] = useState<FormDefinitionSummary[] | null>(null);
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

  useEffect(() => {
    let active = true;
    load(() => active);
    return () => {
      active = false;
    };
  }, [load]);

  return { forms, loadError, refetch: () => load() };
}
