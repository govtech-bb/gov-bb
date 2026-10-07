import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ApiPage, EditorApi, PageVersion, TaxonomyCategory } from "../api/client";
import { historyQuery, pageVersionQuery } from "../api/queries";
import { PagePreview } from "../pages";
import { govbbPageEditor } from "../presets/govbb-page";
import { Button } from "../ui/button";
import { restoredMarkdown } from "./api-pages";
import { WorkspaceDialog } from "./dialogs";

const ACTIONS = {
  created: "Created",
  updated: "Updated",
  published: "Published",
  reverted: "Restored",
  deleted: "Deleted",
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

const who = (version: PageVersion) => version.actor.name ?? version.actor.email ?? version.actor.id;

/** A page's saved versions, newest first; one can be previewed and brought back into the draft. */
export function PageHistoryDialog({
  api,
  current,
  categories,
  canRestore,
  close,
  restore,
}: {
  api: EditorApi;
  current: ApiPage;
  categories: readonly TaxonomyCategory[];
  canRestore: boolean;
  close: () => void;
  restore: (markdown: string) => void;
}) {
  const history = useQuery(historyQuery(api, current.id));
  const [viewing, setViewing] = useState<number>();

  const version = useQuery({
    ...pageVersionQuery(api, current.id, viewing ?? 0),
    enabled: viewing !== undefined,
  });

  return (
    <WorkspaceDialog
      title="Page history"
      description="Each save is a version. Restoring one brings back its title, introduction, description, form and body as unsaved changes; the path, category and visibility stay as they are."
      close={close}
    >
      {viewing === undefined ? (
        history.isError ? (
          <div role="alert">
            <p className="mb-3">We could not load this page's history.</p>
            <Button variant="secondary" onClick={() => void history.refetch()}>
              Try again
            </Button>
          </div>
        ) : history.isPending ? (
          <p role="status" className="text-muted">
            Loading history…
          </p>
        ) : (
          <ol className="divide-y divide-line">
            {history.data.map((entry) => (
              <li key={entry.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="me-auto min-w-0">
                  <span className="block font-semibold">
                    Version {entry.version}: {ACTIONS[entry.action]}
                  </span>
                  <span className="block text-14 text-muted">
                    {who(entry)}, {when.format(new Date(entry.occurred_at))}
                  </span>
                </span>
                <Button variant="secondary" onClick={() => setViewing(entry.version)}>
                  View
                </Button>
              </li>
            ))}
          </ol>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button onClick={() => setViewing(undefined)}>Back to history</Button>
            <Button
              variant="accent"
              disabled={!canRestore || !version.data}
              onClick={() => {
                if (version.data) restore(restoredMarkdown(current, version.data, categories));
              }}
            >
              Restore this version
            </Button>
          </div>
          {version.isError ? (
            <p role="alert">This version can no longer be shown.</p>
          ) : version.isPending ? (
            <p role="status" className="text-muted">
              Loading version…
            </p>
          ) : (
            <div className="rounded-sm border border-line p-4">
              <PagePreview
                source={restoredMarkdown(current, version.data, categories)}
                definition={govbbPageEditor}
              />
            </div>
          )}
        </>
      )}
    </WorkspaceDialog>
  );
}
