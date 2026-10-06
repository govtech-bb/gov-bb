import { useMemo } from "react";
import { readPageMetadata } from "../pages";
import type { DraftStore } from "../persistence/draft-store";
import { currentFormMode } from "./documents";
import { documentLabel, type WorkspaceDocument } from "./model";
import { useDocumentDraft } from "./use-document-draft";

export function DocumentLabel({
  document,
  store,
}: {
  document: WorkspaceDocument;
  store?: DraftStore;
}) {
  const snapshot = useDocumentDraft(document, store);

  const label = useMemo(() => {
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

  return <>{label}</>;
}
