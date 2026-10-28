import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ApiFailure, type CollectionSummary, type EditorApi } from "../../api/client";
import { collectionsQuery } from "../../api/queries";
import { Banner } from "../../ui/banner";
import { Button } from "../../ui/button";
import { ScreenHeader } from "../../ui/screen-header";
import { NameCell } from "../../ui/table/cell-components";
import { createAppColumnHelper, useAppTable } from "../../ui/table/table-hooks";
import { TextLink } from "../../ui/text-link";
import { LoadFailure } from "../load-failure";

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
 * The data collections in api_v2: facts many pages repeat, such as a department's phone number. Developers set each
 * one's fields; a collection's name opens its records.
 */
export function CollectionsScreen({ api }: { api: EditorApi }) {
  const collections = useQuery(collectionsQuery(api));
  const status = collections.error instanceof ApiFailure ? collections.error.status : undefined;

  const refreshFailed =
    collections.isError &&
    !!collections.data &&
    (status === 0 || (status !== undefined && status >= 500));

  const blocked = collections.isError && !refreshFailed;

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
      <ScreenHeader
        title="Collections"
        lead="Facts many pages show, kept once. Change a record here and every page showing it changes."
      />
      <div className="@container min-w-0 rounded-sm bg-white shadow-sheet ring-1 ring-grey-40">
        <p role="status" className="sr-only">
          {collections.isPending ? "Loading collections…" : null}
        </p>
        {refreshFailed && (
          <Banner
            tone="warning"
            layout="strip"
            actions={
              <Button
                variant="secondary"
                pending={collections.isFetching}
                onClick={() => void collections.refetch()}
              >
                {collections.isFetching ? "Refreshing collections…" : "Try again"}
              </Button>
            }
          >
            We could not refresh collections. Showing the last loaded list.
          </Banner>
        )}
        {blocked ? (
          <LoadFailure
            noun="collections"
            error={collections.error}
            retrying={collections.isFetching}
            retry={() => void collections.refetch()}
          />
        ) : (
          <table.DataTable
            caption="Collections"
            loading={collections.isPending}
            empty={{
              title: "No collections yet",
              description:
                "Developers add collections. Once one exists, you can change its records here.",
            }}
          />
        )}
      </div>
    </table.AppTable>
  );
}
