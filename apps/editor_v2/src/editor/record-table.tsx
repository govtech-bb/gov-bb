/**
 * A collection's records, editable.
 *
 * Lives on its own so the same table serves two places: the collection's
 * page under /editor/collections, and the modal a finder or table block
 * opens over the document that reads it. Editing the polyclinic list while
 * looking at the page that lists them is the point — walking away to a
 * separate screen to change a phone number is how the hand-typed markdown
 * version happened in the first place.
 *
 * Fields come from the collection's `schema`, the same list validation rules
 * 6 and 7 resolve names against, so what is editable here and what a block
 * may reference cannot drift apart.
 *
 * The table reads; changes go through a dialog per row. Editing in place made
 * a wide collection a grid of truncated inputs where no value could be read,
 * and a remove button one slip away from a value. Edit opens the row's form,
 * Delete asks first.
 *
 * Scalar fields are editable. A field holding an object or an array — a
 * pharmacy's weekly hours, a holiday's rule — is shown as read-only JSON,
 * because a generic editor for those is a real feature and inventing a bad
 * one would teach the spike nothing.
 */

import type { CollectionDefinition } from "@govtech-bb/block-kit";
import { useCollectionRows, useStore } from "@govtech-bb/spike-db/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Textarea } from "../ui/Field";

type Row = { record_key: string; data: Record<string, unknown> };

const isScalar = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const display = (value: unknown): string =>
  value == null ? "" : isScalar(value) ? String(value) : JSON.stringify(value);

export function RecordTable({
  collection,
}: {
  collection: CollectionDefinition;
}) {
  const rows = useCollectionRows(collection.key);
  // `null` is closed; `{ row: undefined }` is the form for a new record.
  const [editing, setEditing] = useState<{ row?: Row } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  if (rows === undefined) {
    return <p className="text-caption text-mid-grey-00">Loading…</p>;
  }

  const fields = collection.schema.fields;

  return (
    <>
      <DataTable
        data-testid="record-table"
        rows={rows}
        rowKey={(row) => row.record_key}
        rowProps={(row) => ({ "data-testid": `record-${row.record_key}` })}
        caption={
          <div className="flex items-center justify-between gap-s">
            <span>
              <span className="tabular-nums">{rows.length}</span> records ·
              keyed by{" "}
              <code className="font-mono text-caption-sm">
                {collection.record_key}
              </code>
            </span>
            <Button
              type="button"
              size="sm"
              data-testid="add-record"
              onClick={() => setEditing({})}
            >
              Add a record
            </Button>
          </div>
        }
        empty={
          <EmptyState
            title="No records yet"
            description="Add one, and every block reading this collection shows it."
          />
        }
        columns={[
          ...fields.map((field) => ({
            key: field.key,
            header: field.label,
            cell: (row: Row) => {
              const value = row.data[field.key];
              const text = display(value);
              return (
                <span
                  className={
                    isScalar(value)
                      ? "block max-w-[16rem] truncate"
                      : "block max-w-[16rem] truncate font-mono text-caption-sm text-mid-grey-00"
                  }
                  title={text}
                >
                  {text}
                </span>
              );
            },
          })),
          {
            key: "actions",
            header: "Actions",
            hideHeader: true,
            width: "w-[1%]",
            cell: (row: Row) => (
              <div className="flex justify-end gap-xxs whitespace-nowrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`edit-record-${row.record_key}`}
                  aria-label={`Edit ${row.record_key}`}
                  onClick={() => setEditing({ row })}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-00 hover:bg-red-10"
                  data-testid={`delete-record-${row.record_key}`}
                  aria-label={`Delete ${row.record_key}`}
                  onClick={() => setDeleting(row)}
                >
                  Delete
                </Button>
              </div>
            ),
          },
        ]}
      />

      {editing ? (
        <RecordForm
          collection={collection}
          row={editing.row}
          otherKeys={rows
            .map((row) => row.record_key)
            .filter((recordKey) => recordKey !== editing.row?.record_key)}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {deleting ? (
        <DeleteRecord
          collection={collection}
          row={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}

/** Opens a native dialog once it is in the document. */
function useShowModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return ref;
}

function RecordForm({
  collection,
  row,
  otherKeys,
  onClose,
}: {
  collection: CollectionDefinition;
  /** Absent for a new record. */
  row?: Row;
  otherKeys: string[];
  onClose: () => void;
}) {
  const store = useStore();
  const dialog = useShowModal();
  const titleId = useId();
  const idPrefix = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      collection.schema.fields.map((field) => [
        field.key,
        display(row?.data[field.key]),
      ]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const recordKey = (values[collection.record_key] ?? "").trim();
  const keyError = !recordKey
    ? "Give the record a key."
    : otherKeys.includes(recordKey)
      ? `Another record already has the key “${recordKey}”.`
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (keyError) return;
    setSaving(true);
    setFailure(null);
    try {
      const data: Record<string, unknown> = { ...row?.data };
      for (const field of collection.schema.fields) {
        const original = row?.data[field.key];
        const next = values[field.key] ?? "";
        // Read-only values, and fields left as they were, go back exactly as
        // they came — a stored null or number is not rewritten as a string.
        if (row && (!isScalar(original) || next === display(original))) {
          continue;
        }
        data[field.key] = next;
      }
      data[collection.record_key] = recordKey;
      // Changing the key field renames the row.
      const renamed = row && row.record_key !== recordKey;
      await store.saveRecord(
        collection.key,
        recordKey,
        data,
        renamed ? row.record_key : undefined,
      );
      dialog.current?.close();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      ref={dialog}
      ariaLabelledBy={titleId}
      onClose={onClose}
      size="wide"
      data-testid="record-dialog"
    >
      <form
        className="flex flex-col gap-m"
        data-testid="record-form"
        onSubmit={submit}
        noValidate
      >
        <div className="flex flex-col gap-xxs">
          <span className="text-caption-sm uppercase tracking-[0.12em] text-mid-grey-00 font-bold">
            {collection.title}
          </span>
          <h2 id={titleId} className="text-h4 font-bold text-blue-00">
            {row ? `Edit ${row.record_key}` : "Add a record"}
          </h2>
        </div>

        {failure ? (
          <Alert tone="error">The record was not saved: {failure}</Alert>
        ) : null}

        <div className="grid gap-s sm:grid-cols-2">
          {collection.schema.fields.map((field) => {
            const id = `${idPrefix}-${field.key}`;
            const original = row?.data[field.key];
            const readOnly = row !== undefined && !isScalar(original);
            const isKey = field.key === collection.record_key;
            return (
              <Field
                key={field.key}
                label={field.label}
                htmlFor={id}
                className={readOnly ? "sm:col-span-2" : undefined}
                hint={
                  readOnly
                    ? "Objects and arrays are read-only in this spike."
                    : isKey && row
                      ? "Changing the key renames the record."
                      : undefined
                }
                error={isKey && submitted ? keyError : undefined}
              >
                {readOnly ? (
                  <Textarea
                    id={id}
                    readOnly
                    rows={4}
                    value={JSON.stringify(original, null, 2)}
                    data-testid={`record-field-${field.key}`}
                  />
                ) : (
                  <Input
                    id={id}
                    value={values[field.key] ?? ""}
                    aria-invalid={
                      isKey && submitted && keyError ? true : undefined
                    }
                    data-testid={`record-field-${field.key}`}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </Field>
            );
          })}
        </div>

        <div className="flex justify-end gap-xs border-t border-grey-00 pt-s">
          <Button
            type="button"
            variant="secondary"
            data-testid="record-cancel"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
          <Button type="submit" data-testid="record-save" disabled={saving}>
            {saving ? "Saving…" : row ? "Save changes" : "Add record"}
          </Button>
        </div>
      </form>
    </ConfirmDialog>
  );
}

function DeleteRecord({
  collection,
  row,
  onClose,
}: {
  collection: CollectionDefinition;
  row: Row;
  onClose: () => void;
}) {
  const store = useStore();
  const dialog = useShowModal();
  const titleId = useId();
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setFailure(null);
    try {
      await store.deleteRecord(collection.key, row.record_key);
      dialog.current?.close();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ConfirmDialog
      ref={dialog}
      ariaLabelledBy={titleId}
      onClose={onClose}
      data-testid="delete-dialog"
    >
      <div className="flex flex-col gap-xs">
        <h2 id={titleId} className="text-h4 font-bold text-blue-00">
          Delete {row.record_key}?
        </h2>
        <p className="text-caption text-mid-grey-00">
          It is removed from {collection.title}, and from every page with a
          block that reads it. This cannot be undone.
        </p>
      </div>

      {failure ? (
        <Alert tone="error">The record was not deleted: {failure}</Alert>
      ) : null}

      <div className="flex justify-end gap-xs">
        {/* Focus lands on Cancel, so Enter on a stray keypress keeps the row. */}
        <Button
          type="button"
          variant="secondary"
          autoFocus
          data-testid="delete-cancel"
          onClick={() => dialog.current?.close()}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          data-testid="delete-confirm"
          disabled={deleting}
          onClick={confirm}
        >
          {deleting ? "Deleting…" : "Delete record"}
        </Button>
      </div>
    </ConfirmDialog>
  );
}
