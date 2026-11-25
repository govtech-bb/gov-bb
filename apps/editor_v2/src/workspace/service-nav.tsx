import { Plus } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useId, type ReactNode } from "react";
import { visibilityLabels, visibilityTones } from "../pages/visibility";
import type { DraftStore } from "../persistence/draft-store";
import type { DrawerPanel } from "../ui/drawer";
import { Sidebar } from "../ui/sidebar";
import { StatusDot } from "../ui/status-dot";
import { DocumentLabel } from "./document-label";
import type { ServiceNavRow } from "./service-pages";

/**
 * API pages beneath their parents, with visibility indicators and the open editor's in-memory title, under the
 * service's name, and adding a page as the list's last row. What a page itself can do, such as its history and
 * deleting it, is in the page's own bar.
 */
export function ServiceNav({
  sidebar,
  serviceId,
  title,
  rows,
  selectedId,
  stores,
  onAdd,
  readOnly,
  loading = false,
}: {
  /** Whether it shows, beside the page or as a drawer: `useSidebar`. */
  sidebar: DrawerPanel;
  serviceId: string;
  /** The service's name, which heads the list beside the page. */
  title?: string;
  rows: readonly ServiceNavRow[];
  selectedId: string | undefined;
  /** The open editors' drafts, by document. */
  stores: ReadonlyMap<string, DraftStore>;
  onAdd: () => void;
  /** Why nothing can be added, for someone who can't make changes. */
  readOnly?: string;
  /** Its pages are still loading: the rows known so far show, and nothing can be added yet. */
  loading?: boolean;
}) {
  const reason = useId();
  const pages = rows;

  // A page that isn't public says so in words under its title, which its dot only backs up
  const item = (row: ServiceNavRow, nested: ReactNode[]) => (
    <Sidebar.Item
      key={row.document.id}
      current={selectedId === row.document.id}
      status={
        row.visibility && (
          <StatusDot
            tone={visibilityTones.get(row.visibility) ?? "neutral"}
            label={row.visibility === "public" ? visibilityLabels.get(row.visibility) : undefined}
          />
        )
      }
      detail={row.visibility && row.visibility !== "public" && visibilityLabels.get(row.visibility)}
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
    <Sidebar.Root sidebar={sidebar} label="Service pages">
      <Sidebar.Header title={title}>
        <Sidebar.Toggle sidebar={sidebar} label="Pages" />
      </Sidebar.Header>
      <Sidebar.Content>
        <Sidebar.Group label="Pages">{items(pages)}</Sidebar.Group>
        {loading ? (
          <Sidebar.Loading>Loading pages…</Sidebar.Loading>
        ) : (
          pages.length === 0 && (
            <Sidebar.Empty>Add an entry page to explain this service.</Sidebar.Empty>
          )
        )}
        {!loading && (
          <Sidebar.Action
            icon={<Plus />}
            disabled={!!readOnly}
            aria-describedby={readOnly ? reason : undefined}
            onClick={onAdd}
          >
            Add page
          </Sidebar.Action>
        )}
        {readOnly && (
          <p id={reason} className="mt-2 px-3 text-14 text-muted">
            {readOnly}
          </p>
        )}
      </Sidebar.Content>
    </Sidebar.Root>
  );
}
