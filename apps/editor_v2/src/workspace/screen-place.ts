import type { ServiceDetail } from "../api/client";
import type { DraftStore } from "../persistence/draft-store";
import { useDocumentLabel } from "./document-label";
import type { PageDocument } from "./model";

/** The service and page names used by the tab title and header, including in-memory page edits. */
export function useScreenPlace(
  service?: ServiceDetail,
  document?: PageDocument,
  store?: DraftStore,
) {
  return {
    service: service?.service.title,
    document: useDocumentLabel(document, store),
  };
}
