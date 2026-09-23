/**
 * A collection's own page.
 *
 * The table itself lives in `record-table.tsx`, because the same editing
 * surface opens from a block in a document — see `ConfigBlockShell`. This
 * route exists for the case where you want to work on the data itself
 * rather than on a page that happens to read it.
 */

import { useCollections } from "@govtech-bb/spike-db/react";
import { Link, useParams } from "@tanstack/react-router";
import { RecordTable } from "./record-table";

export function CollectionEditor() {
  const { key } = useParams({ from: "/editor/collections/$key" });
  const collections = useCollections();

  if (collections === undefined) return <p className="ed-page">Loading…</p>;

  const collection = collections.find((entry) => entry.key === key);
  if (!collection) {
    return (
      <div className="ed-page">
        <h1>No such collection</h1>
        <Link to="/editor">Back to services</Link>
      </div>
    );
  }

  return (
    <div className="ed-page">
      <p className="ed-breadcrumb">
        <Link to="/editor">← Services</Link>
        <span className="ed-count">Collection</span>
      </p>

      <h1>{collection.title}</h1>
      <p className="ed-lede">
        <code>{collection.key}</code>
      </p>

      <RecordTable collection={collection} />
    </div>
  );
}
