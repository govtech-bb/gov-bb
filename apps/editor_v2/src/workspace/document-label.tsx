import { useSyncExternalStore } from "react";
import { stateMetadata } from "../pages/metadata-yaml";
import type { DraftStore } from "../persistence/draft-store";
import { documentLabel, type PageDocument } from "./model";

const noSubscription = () => () => {};

/**
 * An open page's in-memory title; a closed page uses the API's title, never a stored draft, and so does a page that
 * opened as source, which can't be edited here. It returns the label, not the draft, so what shows it renders again
 * only when the label changes, not with every key typed.
 */
export function useDocumentLabel(document?: PageDocument, store?: DraftStore) {
  return useSyncExternalStore(store?.subscribe ?? noSubscription, () => {
    if (!document) return;
    const snapshot = store?.getSnapshot();

    if (document.role !== "supporting" || !snapshot?.valid || snapshot.recovery || !snapshot.state)
      return documentLabel(document);

    return stateMetadata(snapshot.state)?.title || "Untitled page";
  });
}

export function DocumentLabel({ document, store }: { document: PageDocument; store?: DraftStore }) {
  return <>{useDocumentLabel(document, store)}</>;
}
