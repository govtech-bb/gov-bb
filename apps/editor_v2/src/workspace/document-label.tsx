import { useMemo } from "react";
import { browserDraftStorage } from "../host/govbb-draft";
import { readPageMetadata } from "../pages";
import type { DraftStore } from "../persistence/draft-store";
import { currentFormMode } from "./documents";
import { documentLabel, type WorkspaceDocument } from "./model";
import { draftFollowsServer } from "./page-sync";
import { useDocumentDraft } from "./use-document-draft";

/**
 * A document's name as its draft has it, so a page retitled in its editor is renamed wherever it's listed, and a
 * form's current kind. `store` is the open editor's draft; without one, the draft stored in this browser, unless that
 * is just the server's copy, in which case the document's own title is the server's latest.
 */
export function useDocumentLabel(document?: WorkspaceDocument, store?: DraftStore) {
  // Unreadable storage leaves the document's own title
  const stored = useMemo(() => {
    if (!document) return false;

    try {
      return !draftFollowsServer(browserDraftStorage, document.id, document.keys);
    } catch {
      return false;
    }
  }, [document]);

  const snapshot = useDocumentDraft(store || stored ? document : undefined, store);

  return useMemo(() => {
    if (!document) return;

    if (!snapshot?.valid || snapshot.conflict || snapshot.recovery || snapshot.replacement)
      return documentLabel(document);

    if (document.kind === "form") {
      const mode = currentFormMode(snapshot.state);

      return mode ? documentLabel({ ...document, mode }) : documentLabel(document);
    }

    if (document.role !== "supporting") return documentLabel(document);

    try {
      return readPageMetadata(snapshot.committed).title || "Untitled page";
    } catch {
      return documentLabel(document);
    }
  }, [document, snapshot]);
}

export function DocumentLabel({
  document,
  store,
}: {
  document: WorkspaceDocument;
  store?: DraftStore;
}) {
  return <>{useDocumentLabel(document, store)}</>;
}
