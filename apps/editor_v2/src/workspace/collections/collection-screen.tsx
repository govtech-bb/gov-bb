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
import { ListScreen } from "../../ui/list-screen";
import { RefreshFailure } from "../../ui/refresh-failure";
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
  // Each dialog stays on the page once closed, so it fades out showing what it showed open. Counting the openings
  // makes each one a new dialog; its kind in the key keeps an Add from taking over an Edit with the same count
  const [additions, setAdditions] = useState(0);
  const [deletion, setDeletion] = useState<{ record: CollectionRecord; opening: number }>();
  const [shown, setShown] = useState<{ record: CollectionRecord; opening: number }>();
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

  if (opened?.record_key !== wanted && found !== opened) {
    setOpened(found);

    if (found) setShown((last) => ({ record: found, opening: (last?.opening ?? 0) + 1 }));
  }

  const startAdding = () => {
    setAdditions((count) => count + 1);
    setAdding(true);
  };

  const startDeleting = (record: CollectionRecord) => {
    setDeleting(record);
    setDeletion((last) => ({ record, opening: (last?.opening ?? 0) + 1 }));
  };

  const columns = useMemo(
    () =>
      collection
        ? recordColumns(
            collection,
            (record) => onRecord(record.record_key),
            startDeleting,
            readOnly,
          )
        : [],
    // startDeleting sets state only
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
      <ListScreen
        ref={card}
        title={collection?.title ?? "Collection"}
        lead="Each record is one entry pages can show, such as a department's contact details."
        action={
          <Button
            ref={add}
            variant="accent"
            size="md"
            disabled={readOnly || !collection}
            onClick={startAdding}
          >
            Add record
          </Button>
        }
        status={detail.isPending ? "Loading records…" : null}
        notices={
          <>
            {wanted && detail.data && !found && !opened && (
              <Banner tone="warning" layout="strip" inset="card">
                There is no record “{wanted}” in this collection. It may have been deleted.
              </Banner>
            )}
            {refreshFailed && (
              <RefreshFailure
                inset="card"
                pending={detail.isFetching}
                pendingLabel="Refreshing records…"
                onRetry={() => void detail.refetch()}
              >
                We could not refresh these records. Showing the last loaded list.
              </RefreshFailure>
            )}
          </>
        }
        failure={
          blocked && (
            <LoadFailure
              noun="records"
              error={detail.error}
              retrying={detail.isFetching}
              retry={() => void detail.refetch()}
            />
          )
        }
      >
        <table.DataTable
          caption={collection ? `${collection.title} records` : "Records"}
          loading={detail.isPending}
          empty={{
            title: "No records yet",
            description: "Add one, and pages can show it.",
            actions: !readOnly && (
              <Button variant="secondary" onClick={startAdding}>
                Add record
              </Button>
            ),
          }}
        />
        <table.Pagination name={["record", "records"]} />
      </ListScreen>
      {collection && additions > 0 && (
        <RecordDialog
          key={`add-${additions}`}
          open={adding}
          api={api}
          collection={collection}
          readOnly={readOnly}
          close={() => setAdding(false)}
        />
      )}
      {collection && shown && (
        <RecordDialog
          key={`edit-${shown.opening}`}
          open={!!opened}
          api={api}
          collection={collection}
          record={shown.record}
          readOnly={readOnly}
          close={() => onRecord(undefined)}
          // Back to the record's row, which also gives a dialog opened from the address somewhere to go
          finalFocus={() =>
            [...(card.current?.querySelectorAll<HTMLElement>("[data-edit]") ?? [])].find(
              (button) => button.dataset.edit === shown.record.record_key,
            ) ?? true
          }
        />
      )}
      {collection && deletion && (
        <DeleteRecordDialog
          key={`delete-${deletion.opening}`}
          open={!!deleting}
          api={api}
          collection={collection}
          record={deletion.record}
          close={() => setDeleting(undefined)}
          focusAfter={add}
        />
      )}
    </table.AppTable>
  );
}
