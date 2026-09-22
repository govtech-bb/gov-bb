import { reset } from "@govtech-bb/spike-db";
import { useDb, useDocumentList } from "@govtech-bb/spike-db/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

export function DocumentList() {
  const documents = useDocumentList();
  const db = useDb();
  const [resetting, setResetting] = useState(false);

  return (
    <div className="ed-page">
      <h1>Pages</h1>
      <p className="ed-lede">
        Five pages chosen because they are awkward in different ways, plus the
        two stubs their start links need in order to satisfy rule 8.
      </p>

      <p className="ed-lede">
        <button
          type="button"
          className="ed-secondary"
          data-testid="reset-data"
          disabled={resetting}
          onClick={async () => {
            setResetting(true);
            try {
              // Drop, migrate, reseed. The way back to the shipped content
              // after an edit — or a delete — you would rather undo.
              await reset(db);
            } finally {
              setResetting(false);
            }
          }}
        >
          {resetting ? "Resetting…" : "Reset to the seeded content"}
        </button>
      </p>

      {documents === undefined ? (
        <p>Loading…</p>
      ) : (
        <table className="ed-table" data-testid="doc-list">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">URL</th>
              <th scope="col">Schema</th>
              <th scope="col">Last saved</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <Link to="/editor/$id" params={{ id: doc.id }}>
                    {doc.title}
                  </Link>
                </td>
                <td>
                  <code>{doc.url}</code>
                </td>
                <td>{doc.schema_name}</td>
                <td>{new Date(doc.updated_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
