import type { ServiceDetail } from "../api/client";
import type { DraftStore } from "../persistence/draft-store";
import { useDocumentLabel } from "./document-label";
import {
  documentLabel,
  type PageDocument,
  type WorkspaceDocument,
  type WorkspaceService,
} from "./model";

/**
 * Where the author is, by name: the open service, and the document open in it as the sidebar names it. The tab's
 * title and the header's trail read it, so breadcrumbs can too. A browser draft's document is named as it's typed.
 */
export function useScreenPlace(
  local: { service?: WorkspaceService; document?: WorkspaceDocument; store?: DraftStore },
  remote: { service?: ServiceDetail; document?: PageDocument },
) {
  const localDocument = useDocumentLabel(local.document, local.store);

  return {
    service: local.service?.title ?? remote.service?.service.title,
    document: localDocument ?? (remote.document && documentLabel(remote.document)),
  };
}
