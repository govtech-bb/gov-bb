import { useEffect, useMemo, useSyncExternalStore } from "react";
import { browserDraftStorage } from "../host/govbb-draft";
import type { DraftStore } from "../persistence/draft-store";
import { openDocument } from "./documents";
import type { WorkspaceDocument } from "./model";

const noSubscription = () => () => {};

const noSnapshot = () => undefined;

export function useDocumentDraft(document?: WorkspaceDocument, mountedStore?: DraftStore) {
  const store = useMemo(
    () => mountedStore ?? (document && openDocument(document, browserDraftStorage)),
    [document, mountedStore],
  );

  useEffect(() => {
    if (!store || mountedStore) return;
    const external = (event: StorageEvent) => store.externalChange(event.key);
    window.addEventListener("storage", external);
    store.externalChange(null);

    return () => window.removeEventListener("storage", external);
  }, [store, mountedStore]);

  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getSnapshot ?? noSnapshot);
}
