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
 * Scalar fields are edited inline. A field holding an object or an array — a
 * pharmacy's weekly hours, a holiday's rule — is shown as read-only JSON,
 * because a generic editor for those is a real feature and inventing a bad
 * one would teach the spike nothing.
 */

import type { CollectionDefinition } from "@govtech-bb/block-kit";
import { useCollectionRows, useStore } from "@govtech-bb/spike-db/react";
import { useState } from "react";

const isScalar = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

export function RecordTable({
  collection,
}: {
  collection: CollectionDefinition;
}) {
  const rows = useCollectionRows(collection.key);
  const store = useStore();
  const [busy, setBusy] = useState(false);

  if (rows === undefined) return <p>Loading…</p>;

  const fields = collection.schema.fields;

  const write = async (
    recordKey: string,
    data: Record<string, unknown>,
    previousKey?: string,
  ) => {
    setBusy(true);
    try {
      await store.saveRecord(collection.key, recordKey, data, previousKey);
    } finally {
      setBusy(false);
    }
  };

  const addRecord = async () => {
    const recordKey = `new-${Date.now().toString(36)}`;
    const data: Record<string, unknown> = {
      [collection.record_key]: recordKey,
    };
    for (const field of fields) data[field.key] ??= "";
    await write(recordKey, data);
  };

  return (
    <>
      <p className="ed-record-summary">
        {rows.length} records · keyed by <code>{collection.record_key}</code>
        <button
          type="button"
          className="ed-secondary"
          data-testid="add-record"
          disabled={busy}
          onClick={addRecord}
        >
          Add a record
        </button>
      </p>

      <div className="ed-table-scroll">
        <table className="ed-table" data-testid="record-table">
          <thead>
            <tr>
              {fields.map((field) => (
                <th key={field.key} scope="col">
                  {field.label}
                </th>
              ))}
              <th scope="col">
                <span className="ed-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.record_key} data-testid={`record-${row.record_key}`}>
                {fields.map((field) => {
                  const value = row.data[field.key];
                  return (
                    <td key={field.key}>
                      {isScalar(value) ? (
                        <input
                          className="ed-input"
                          aria-label={`${field.label} for ${row.record_key}`}
                          data-testid={`field-${row.record_key}-${field.key}`}
                          defaultValue={value == null ? "" : String(value)}
                          onBlur={(event) => {
                            if (String(value ?? "") === event.target.value)
                              return;
                            const next = {
                              ...row.data,
                              [field.key]: event.target.value,
                            };
                            // Editing the key field renames the row.
                            const isKeyField =
                              field.key === collection.record_key;
                            void write(
                              isKeyField ? event.target.value : row.record_key,
                              next,
                              isKeyField ? row.record_key : undefined,
                            );
                          }}
                        />
                      ) : (
                        <code
                          className="ed-json-cell"
                          title="Objects and arrays are read-only in this spike"
                        >
                          {JSON.stringify(value)}
                        </code>
                      )}
                    </td>
                  );
                })}
                <td>
                  <button
                    type="button"
                    className="ed-danger"
                    data-testid={`remove-record-${row.record_key}`}
                    disabled={busy}
                    onClick={() =>
                      void store.deleteRecord(collection.key, row.record_key)
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
