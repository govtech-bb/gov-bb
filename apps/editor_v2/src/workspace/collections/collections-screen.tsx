import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { CollectionSummary, EditorApi } from "../../api/client";
import { collectionsQuery } from "../../api/queries";
import { Banner } from "../../ui/banner";
import { Button } from "../../ui/button";
import { ListScreen } from "../../ui/list-screen";
import { NameCell } from "../../ui/table/cell-components";
import { createAppColumnHelper, useAppTable } from "../../ui/table/table-hooks";
import { TextLink } from "../../ui/text-link";
import { listLoadView } from "../list-load-view";
import { AddCollectionDialog } from "./collection-dialog";

const column = createAppColumnHelper<CollectionSummary>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: CollectionSummary[] = [];

const columns = column.columns([
  column.accessor("title", {
    header: "Collection",
    sortFn: "text",
    enableHiding: false,
    cell: ({ row: { original: collection } }) => (
      <NameCell
        name={
          <TextLink render={<Link to="/collections/$key" params={{ key: collection.key }} />}>
            {collection.title}
          </TextLink>
        }
        path={collection.key}
        details={`${collection.record_count} ${collection.record_count === 1 ? "record" : "records"}`}
      />
    ),
  }),
  column.accessor("record_count", {
    header: () => <span className="block text-end">Records</span>,
    sortFn: "basic",
    meta: { secondary: true },
    cell: ({ row }) => (
      <span className="block text-end text-14 tabular-nums">{row.original.record_count}</span>
    ),
  }),
]);

/**
 * The data collections in api_v2: facts many pages repeat, such as a department's phone number. An admin or an
 * approver adds a collection, setting its fields once, and the new collection opens so its first record can be added;
 * a collection's name opens its records.
 */
export function CollectionsScreen({
  api,
  readOnly = false,
  why,
}: {
  api: EditorApi;
  /** Collections can't be added by someone who is neither an admin nor an approver (#3681). */
  readOnly?: boolean;
  /** Why they can't, once that is known. */
  why?: string;
}) {
  const collections = useQuery(collectionsQuery(api));
  const load = listLoadView(collections, "collections");
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  // Counts the openings, so each opens afresh: nothing typed, and no answer left from the last time
  const [openings, setOpenings] = useState(0);

  const startAdding = () => {
    setOpenings((count) => count + 1);
    setAdding(true);
  };

  const table = useAppTable({
    columns,
    data: collections.data ?? loading,
    getRowId: (collection) => collection.key,
    // Collections are few: one page, by name
    manualPagination: true,
    initialState: { sorting: [{ id: "title", desc: false }] },
  });

  return (
    <table.AppTable>
      <ListScreen
        title="Collections"
        lead="Facts many pages show, kept once. Change a record here and every page showing it changes."
        action={
          <Button variant="accent" size="md" disabled={readOnly} onClick={startAdding}>
            Add collection
          </Button>
        }
        status={load.status}
        notices={
          <>
            {readOnly && why && (
              <Banner tone="info" layout="strip" inset="card">
                {why}
              </Banner>
            )}
            {load.notices}
          </>
        }
        failure={load.failure}
      >
        <table.DataTable
          caption="Collections"
          loading={collections.isPending}
          empty={{
            title: "No collections yet",
            description: readOnly
              ? "Admins and approvers add collections. Once one exists, you can change its records here."
              : "Add one to keep facts many pages show, such as contact details, in one place.",
            // The header holds the teal Add collection, so this one is grey
            actions: (
              <Button variant="secondary" disabled={readOnly} onClick={startAdding}>
                Add collection
              </Button>
            ),
          }}
        />
      </ListScreen>
      {openings > 0 && (
        <AddCollectionDialog
          key={openings}
          api={api}
          open={adding}
          taken={collections.data?.map((collection) => collection.key) ?? []}
          onClose={() => setAdding(false)}
          onAdded={(collection) => {
            setAdding(false);
            void navigate({ to: "/collections/$key", params: { key: collection.key } });
          }}
        />
      )}
    </table.AppTable>
  );
}
