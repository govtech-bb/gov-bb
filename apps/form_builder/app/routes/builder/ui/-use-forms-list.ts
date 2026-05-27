import { useEffect, useState } from "react";
import { listForms } from "../../../server/forms";
import type { FormDefinitionSummary } from "../../../types/index";

export interface FormsListState {
  /** The published/draft forms, or `null` while the mount fetch is in flight. */
  forms: FormDefinitionSummary[] | null;
  /** A message if the mount fetch failed, otherwise `null`. */
  loadError: string | null;
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

  useEffect(() => {
    let active = true;
    listForms()
      .then((result) => {
        if (active) setForms(result);
      })
      .catch((e) => {
        if (active) {
          setLoadError(e instanceof Error ? e.message : "Failed to load forms");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { forms, loadError };
}
