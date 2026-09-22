import { useDocumentList } from "@govtech-bb/spike-db/react";
import { Link } from "@tanstack/react-router";

export function SiteIndex() {
  const documents = useDocumentList();

  return (
    <div className="bk-document">
      <h1 className="bk-title">Block editor spike</h1>
      <p className="bk-description">
        Five pages, chosen because they are awkward in different ways. Each is
        rendered from a block document in the local Postgres by the same
        renderer the editor edits with.
      </p>

      {documents === undefined ? (
        <p className="site-loading">Loading…</p>
      ) : (
        <ul className="site-index">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link to={doc.url} className="site-index-link">
                {doc.title}
              </Link>
              <p className="site-index-meta">
                <code>{doc.url}</code> · {doc.schema_name}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="bk-paragraph">
        <Link to="/editor" className="bk-start-button">
          Open the editor
        </Link>
      </p>
    </div>
  );
}
