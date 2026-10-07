import { Link } from "@tanstack/react-router";
import { documentLabel, type PageDocument } from "./model";

/** An API service's pages, in the sidebar the browser workspace uses. */
export function ApiServiceNav({
  serviceId,
  documents,
  selectedId,
}: {
  serviceId: string;
  documents: readonly PageDocument[];
  selectedId: string | undefined;
}) {
  return (
    <aside className="border-e border-line bg-white px-4 py-5 max-lg:border-e-0 max-lg:border-b">
      <details open>
        <summary className="cursor-pointer font-semibold">Service documents</summary>
        <nav aria-label="Service documents" className="mt-4">
          <h2 className="mb-2 text-14 font-semibold text-muted">Pages</h2>
          <ul className="flex flex-col gap-1">
            {documents.map((document) => (
              <li key={document.id}>
                <Link
                  to="/services/$serviceId/$documentId"
                  params={{ serviceId, documentId: document.id }}
                  aria-current={selectedId === document.id ? "page" : undefined}
                  className="block rounded-sm px-3 py-2 text-14 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-blue-10 aria-[current=page]:font-semibold"
                >
                  {documentLabel(document)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </details>
    </aside>
  );
}
