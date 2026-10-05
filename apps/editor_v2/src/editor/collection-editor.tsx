/**
 * A collection's own page.
 *
 * The table itself lives in `record-table.tsx`, because the same editing
 * surface opens from a block in a document — see `ConfigBlockShell`. This
 * route exists for the case where you want to work on the data itself
 * rather than on a page that happens to read it.
 */

import { useCollections } from "@govtech-bb/spike-db/react";
import { useParams } from "@tanstack/react-router";
import { RecordTable } from "./record-table";
import { BackLink } from "./back-link";
import { PageHeader } from "../ui/PageHeader";

export function CollectionEditor() {
  const { key } = useParams({ from: "/editor/collections/$key" });
  const collections = useCollections();

  if (collections === undefined) {
    return <p className="text-caption text-mid-grey-00">Loading…</p>;
  }

  const collection = collections.find((entry) => entry.key === key);
  if (!collection) {
    return (
      <div>
        <BackLink />
        <PageHeader title="No such collection" />
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <PageHeader
        eyebrow="Collection"
        title={collection.title}
        description={<code className="font-mono">{collection.key}</code>}
      />
      <RecordTable collection={collection} />
    </div>
  );
}
