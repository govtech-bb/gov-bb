/**
 * Editing a collection's records.
 *
 * Until now a block could be configured *over* a collection — which columns
 * a table shows, which facets a finder offers — but the collection itself
 * was read-only. That made the brief's own §3.7 requirement, that bank
 * holiday rules be editable rows, impossible to satisfy, and it meant the
 * seven Environmental Health offices could be pointed at but never
 * corrected.
 *
 * Fields come from the collection's `schema`, which is the same list
 * validation rules 6 and 7 resolve names against — so what you can edit here
 * and what a block may reference cannot drift apart.
 *
 * Scalar fields are edited inline. A field holding an object or an array —
 * a pharmacy's weekly hours, a holiday's rule — is shown as read-only JSON,
 * because a generic editor for those is a real feature and inventing a bad
 * one would teach the spike nothing.
 */

import {
  useCollections,
  useCollectionRows,
  useStore,
} from "@govtech-bb/spike-db/react";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";

const isScalar = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

export function CollectionEditor() {
  const { key } = useParams({ from: "/editor/collections/$key" });
  const collections = useCollections();
  const rows = useCollectionRows(key);
  const store = useStore();

  const [busy, setBusy] = useState(false);
  const collection = collections?.find((entry) => entry.key === key);

  if (collections === undefined || rows === undefined) {
    return <p className="ed-page">Loading…</p>;
  }
  if (!collection) {
    return (
      <div className="ed-page">
        <h1>No such collection</h1>
        <Link to="/editor">Back to services</Link>
      </div>
    );
  }

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
    <div className="ed-page">
      <p className="ed-breadcrumb">
        <Link to="/editor">← Services</Link>
        <span className="ed-count">Collection</span>
      </p>

      <h1>{collection.title}</h1>
      <p className="ed-lede">
        <code>{collection.key}</code> · {rows.length} records · keyed by{" "}
        <code>{collection.record_key}</code>
      </p>

      <p>
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
  );
}
