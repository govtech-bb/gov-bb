import { useDocumentList } from '@govtech-bb/spike-db/react'
import { Link } from '@tanstack/react-router'

export function DocumentList() {
  const documents = useDocumentList()

  return (
    <div className="ed-page">
      <h1>Pages</h1>
      <p className="ed-lede">
        Three pages chosen because they are awkward in different ways, plus
        the calculator stub the severance start link needs.
      </p>

      {documents === undefined ? (
        <p>Loading…</p>
      ) : (
        <table className="ed-table">
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
  )
}
