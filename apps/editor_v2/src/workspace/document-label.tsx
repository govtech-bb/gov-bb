import { useMemo, useSyncExternalStore } from "react";
import { readPageMetadata } from "../pages";
import type { DraftStore } from "../persistence/draft-store";
import { documentLabel, type PageDocument } from "./model";

const noSubscription = () => () => {};

const noSnapshot = () => undefined;

/** An open page's in-memory title; a closed page uses the API's title, never a stored draft. */
export function useDocumentLabel(document?: PageDocument, store?: DraftStore) {
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getSnapshot ?? noSnapshot,
  );

  return useMemo(() => {
    if (!document) return;

    if (document.role !== "supporting" || !snapshot?.valid || snapshot.recovery)
      return documentLabel(document);

    return readPageMetadata(snapshot.committed).title || "Untitled page";
  }, [document, snapshot]);
}

export function DocumentLabel({ document, store }: { document: PageDocument; store?: DraftStore }) {
  return <>{useDocumentLabel(document, store)}</>;
}
