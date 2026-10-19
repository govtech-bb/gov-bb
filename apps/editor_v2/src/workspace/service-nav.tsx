import { Link } from "@tanstack/react-router";
import { useId, type ReactNode } from "react";
import { visibilityLabels, visibilityTones } from "../pages";
import type { DraftStore } from "../persistence/draft-store";
import { Button } from "../ui/button";
import type { DrawerPanel } from "../ui/drawer";
import { Sidebar } from "../ui/sidebar";
import { StatusDot } from "../ui/status-dot";
import { DocumentLabel } from "./document-label";
import type { ServiceNavRow } from "./service-pages";

/**
 * A service's documents, whether it's drafted in this browser or comes from the content API: its pages, each under
 * the page it sits beneath and dotted with how far it's published, then its form. Each row is named as its draft has
 * it, so a page retitled in its editor is renamed here as it's saved.
 */
export function ServiceNav({
  sidebar,
  serviceId,
  rows,
  selectedId,
  stores,
  onAdd,
  onRename,
  onDelete,
  deleteBlocked,
  loading = false,
}: {
  /** Whether it shows, beside the page or as a drawer: `useSidebar`. */
  sidebar: DrawerPanel;
  serviceId: string;
  rows: readonly ServiceNavRow[];
  selectedId: string | undefined;
  /** The open editors' drafts, by document. */
  stores: ReadonlyMap<string, DraftStore>;
  onAdd: () => void;
  /** Renames a service drafted in this browser. */
  onRename?: () => void;
  /** Deletes the selected page from the content API. */
  onDelete?: () => void;
  /** Why the selected page can't be deleted yet, such as the pages under it. */
  deleteBlocked?: string;
  /** Its pages are still loading: the rows known so far show, and nothing can be added or deleted yet. */
  loading?: boolean;
}) {
  const reason = useId();
  const pages = rows.filter((row) => row.document.kind === "page");
  const forms = rows.filter((row) => row.document.kind === "form");

  const item = (row: ServiceNavRow, nested: ReactNode[]) => (
    <Sidebar.Item
      key={row.document.id}
      current={selectedId === row.document.id}
      status={
        row.visibility && (
          <StatusDot
            tone={visibilityTones.get(row.visibility) ?? "neutral"}
            label={visibilityLabels.get(row.visibility)}
          />
        )
      }
      nested={nested.length > 0 ? nested : undefined}
      render={
        <Link
          to="/services/$serviceId/$documentId"
          params={{ serviceId, documentId: row.document.id }}
        />
      }
    >
      <DocumentLabel document={row.document} store={stores.get(row.document.id)} />
    </Sidebar.Item>
  );

  // Each row of the list's top level, with the deeper rows straight after it listed under it
  const items = (list: readonly ServiceNavRow[]): ReactNode[] => {
    const top = list[0]?.depth;

    return list.flatMap((row, index) => {
      if (row.depth !== top) return [];
      const next = list.findIndex((later, at) => at > index && later.depth <= top);

      return [item(row, items(list.slice(index + 1, next === -1 ? undefined : next)))];
    });
  };

  return (
    <Sidebar.Root sidebar={sidebar} label="Service documents">
      <Sidebar.Header />
      <Sidebar.Content>
        <Sidebar.Group label="Pages">{items(pages)}</Sidebar.Group>
        {loading ? (
          <Sidebar.Empty>Loading pages…</Sidebar.Empty>
        ) : (
          pages.length === 0 && (
            <Sidebar.Empty>Add an entry page to explain this service.</Sidebar.Empty>
          )
        )}
        {forms.length > 0 && (
          <>
            <Sidebar.Separator />
            <Sidebar.Group>{items(forms)}</Sidebar.Group>
          </>
        )}
        {!loading && (
          <Sidebar.Actions>
            <Button variant="secondary" onClick={onAdd}>
              Add document
            </Button>
            {onRename && <Button onClick={onRename}>Rename service</Button>}
            {onDelete && (
              <Button
                disabled={!pages.some((row) => row.document.id === selectedId) || !!deleteBlocked}
                aria-describedby={deleteBlocked ? reason : undefined}
                onClick={onDelete}
              >
                Delete page
              </Button>
            )}
          </Sidebar.Actions>
        )}
        {deleteBlocked && (
          <p id={reason} className="mt-2 text-14 text-muted">
            {deleteBlocked}
          </p>
        )}
      </Sidebar.Content>
    </Sidebar.Root>
  );
}
