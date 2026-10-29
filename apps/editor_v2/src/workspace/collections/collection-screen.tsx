import { PencilSimple, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ApiFailure,
  type Collection,
  type CollectionRecord,
  type EditorApi,
} from "../../api/client";
import { collectionQuery } from "../../api/queries";
import { Banner } from "../../ui/banner";
import { Button } from "../../ui/button";
import { EmptyState } from "../../ui/empty-state";
import { ScreenHeader } from "../../ui/screen-header";
import { createAppColumnHelper, useAppTable } from "../../ui/table/table-hooks";
import { TextLink } from "../../ui/text-link";
import { LoadFailure } from "../load-failure";
import { DeleteRecordDialog, RecordDialog } from "./record-dialog";

const column = createAppColumnHelper<CollectionRecord>();

// A stable empty list: a new [] each render would make the table recount its rows every render
const loading: CollectionRecord[] = [];

/**
 * A column per field, the record's key first, then Edit and Delete. Values wrap over two lines at most, so a wide
 * collection stays readable; the dialog shows each in full.
 */
const recordColumns = (
  collection: Collection,
  edit: (record: CollectionRecord) => void,
  remove: (record: CollectionRecord) => void,
  readOnly: boolean,
) => {
  const fields = collection.schema.fields.toSorted(
    (a, b) => Number(b.key === collection.record_key) - Number(a.key === collection.record_key),
  );

  const keyListed = fields[0]?.key === collection.record_key;

  return column.columns([
    ...(keyListed
      ? []
      : [
          column.accessor("record_key", {
            header: "Key",
            sortFn: "text",
            enableHiding: false,
            cell: ({ getValue }) => <span className="font-mono text-12">{getValue()}</span>,
          }),
        ]),
    ...fields.map((field, index) =>
      column.accessor((record) => record.data[field.key] ?? "", {
        id: `field:${field.key}`,
        header: field.label,
        sortFn: "text",
        enableHiding: false,
        cell: ({ getValue }) => {
          const value = getValue();

          return value ? (
            <span
              className={
                index === 0 && keyListed
                  ? "font-mono text-12"
                  : "line-clamp-2 max-w-64 text-14 wrap-break-word"
              }
            >
              {value}
            </span>
          ) : (
            <span className="text-muted">None</span>
          );
        },
      }),
    ),
    column.display({
      id: "actions",
      header: () => <span className="block text-end">Actions</span>,
      cell: ({ row: { original: record } }) => (
        <div className="flex justify-end gap-1">
          <Button
            icon={<PencilSimple />}
            aria-label={`${readOnly ? "View" : "Edit"} ${record.record_key}`}
            data-edit={record.record_key}
            onClick={() => edit(record)}
          >
            {readOnly ? "View" : "Edit"}
          </Button>
          <Button
            icon={<Trash />}
            aria-label={`Delete ${record.record_key}`}
            disabled={readOnly}
            onClick={() => remove(record)}
          >
            Delete
          </Button>
        </div>
      ),
    }),
  ]);
};

/**
 * A collection's records, from api_v2, in a table read across; each record is added, changed and deleted in a
 * dialog. `record`, from the address, names the record whose dialog is open, and `onRecord` asks for another, or for
 * none once it closes.
 */
export function CollectionScreen({
  api,
  collectionKey,
  record: wanted,
  onRecord,
  readOnly = false,
}: {
  api: EditorApi;
  collectionKey: string;
  record?: string;
  onRecord: (record: string | undefined) => void;
  /** Records can't be added, saved or deleted by someone without the editor role; the workspace says why. */
  readOnly?: boolean;
}) {
  const detail = useQuery(collectionQuery(api, collectionKey));
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<CollectionRecord>();
  const add = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const collection = detail.data?.collection;
  const status = detail.error instanceof ApiFailure ? detail.error.status : undefined;

  const refreshFailed =
    detail.isError && !!detail.data && (status === 0 || (status !== undefined && status >= 500));

  const blocked = detail.isError && !refreshFailed;

  const found = wanted
    ? detail.data?.records.find((item) => item.record_key === wanted)
    : undefined;

  // The record whose dialog is open, as it was read when it opened: a refresh, even one without it, leaves the
  // dialog and what's typed in it alone
  const [opened, setOpened] = useState<CollectionRecord>();

  if (opened?.record_key !== wanted && found !== opened) setOpened(found);

  const columns = useMemo(
    () =>
      collection
        ? recordColumns(collection, (record) => onRecord(record.record_key), setDeleting, readOnly)
        : [],
    [collection, onRecord, readOnly],
  );

  const table = useAppTable({
    columns,
    data: detail.data?.records ?? loading,
    getRowId: (record) => record.record_key,
  });

  if (blocked && status === 404)
    return (
      <EmptyState
        kind="not-found"
        size="page"
        title="Collection not found"
        description="It may have been removed, or the address may be wrong."
        actions={<TextLink render={<Link to="/collections" />}>Back to collections</TextLink>}
      />
    );

  return (
    <table.AppTable>
      <ScreenHeader
        title={collection?.title ?? "Collection"}
        lead="Each record is one entry pages can show, such as a department's contact details."
        action={
          <Button
            ref={add}
            variant="accent"
            size="md"
            disabled={readOnly || !collection}
            onClick={() => setAdding(true)}
          >
            Add record
          </Button>
        }
      />
      {wanted && detail.data && !found && !opened && (
        <Banner tone="warning" className="mb-4">
          There is no record “{wanted}” in this collection. It may have been deleted.
        </Banner>
      )}
      <div
        ref={card}
        className="@container min-w-0 rounded-sm bg-white shadow-sheet ring-1 ring-grey-40"
      >
        <p role="status" className="sr-only">
          {detail.isPending ? "Loading records…" : null}
        </p>
        {refreshFailed && (
          <Banner
            tone="warning"
            layout="strip"
            actions={
              <Button
                variant="secondary"
                pending={detail.isFetching}
                onClick={() => void detail.refetch()}
              >
                {detail.isFetching ? "Refreshing records…" : "Try again"}
              </Button>
            }
          >
            We could not refresh these records. Showing the last loaded list.
          </Banner>
        )}
        {blocked ? (
          <LoadFailure
            noun="records"
            error={detail.error}
            retrying={detail.isFetching}
            retry={() => void detail.refetch()}
          />
        ) : (
          <table.DataTable
            caption={collection ? `${collection.title} records` : "Records"}
            loading={detail.isPending}
            empty={{
              title: "No records yet",
              description: "Add one, and pages can show it.",
              actions: !readOnly && (
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  Add record
                </Button>
              ),
            }}
          />
        )}
        {!blocked && <table.Pagination name={["record", "records"]} />}
      </div>
      {collection && adding && (
        <RecordDialog
          api={api}
          collection={collection}
          readOnly={readOnly}
          close={() => setAdding(false)}
        />
      )}
      {collection && opened && (
        <RecordDialog
          key={opened.record_key}
          api={api}
          collection={collection}
          record={opened}
          readOnly={readOnly}
          close={() => {
            onRecord(undefined);
            // Opened from the address, it has no button to give the focus back to, so its row's Edit takes it
            setTimeout(() => {
              if (document.activeElement !== document.body) return;

              [...(card.current?.querySelectorAll<HTMLElement>("[data-edit]") ?? [])]
                .find((button) => button.dataset.edit === opened.record_key)
                ?.focus();
            });
          }}
        />
      )}
      {collection && deleting && (
        <DeleteRecordDialog
          api={api}
          collection={collection}
          record={deleting}
          close={() => setDeleting(undefined)}
          focusAfter={add}
        />
      )}
    </table.AppTable>
  );
}
