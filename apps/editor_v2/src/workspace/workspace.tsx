import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw";
import { Link, useBlocker, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { CaretRight, PencilSimpleLine } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { EditorApi } from "../api/client";
import { workspaceLink } from "./navigation";
import { Button } from "../ui/button";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { DocumentLabel } from "./document-label";
import type { DraftStore } from "../persistence/draft-store";
import { DocumentDialog, ServiceDialog } from "./dialogs";
import { openDocument, openWorkspace } from "./documents";
import { WorkspaceFormEditor } from "./form-editor";
import { ServicesList } from "./services-list";
import {
  documentLabel,
  flushDocument,
  WORKSPACE_KEY,
  type WorkspaceDocument,
  type WorkspaceLocation,
  type WorkspaceRepository,
} from "./model";

type Account = { email: string; onSignOut: () => Promise<string | undefined> };

type OpenDocument = { document: WorkspaceDocument; store: DraftStore };

type Boot = { repository: WorkspaceRepository; location: WorkspaceLocation; panes: OpenDocument[] };

function boot(requested: WorkspaceLocation, selectInitial: boolean): Boot {
  const { repository, initialLocation } = openWorkspace(
    browserDraftStorage,
    Object.keys(window.localStorage),
  );

  const first = repository.index.services[0];

  const location = selectInitial
    ? (initialLocation ?? (first && { serviceId: first.id, documentId: first.documents[0]?.id }))
    : requested;

  const document = repository.index.services
    .find((service) => service.id === location?.serviceId)
    ?.documents.find((item) => item.id === location?.documentId);

  return {
    repository,
    location,
    panes: document ? [{ document, store: openDocument(document, browserDraftStorage) }] : [],
  };
}

function downloadWorkspace() {
  const source = window.localStorage.getItem(WORKSPACE_KEY);

  if (source === null) return;
  const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "service-workspace.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open local drafts only after the host has authenticated the employee. */
export function ServiceWorkspace({ api, email, onSignOut }: Account & { api: EditorApi }) {
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const [initial] = useState(() => {
    try {
      return {
        ready: boot(
          params.serviceId
            ? { serviceId: params.serviceId, documentId: params.documentId }
            : undefined,
          pathname === "/",
        ),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "The service workspace could not be opened",
      };
    }
  });

  if (!initial.ready)
    return (
      <main className="mx-auto max-w-160 p-8 text-ink">
        <h1 className="text-28 font-semibold">Open the service workspace</h1>
        <p role="alert" className="my-4">
          {initial.error}
        </p>
        <p className="mb-4">
          Existing drafts have been kept. Download the service list before repairing it.
        </p>
        <Button onClick={downloadWorkspace}>Download service list</Button>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </main>
    );

  return <Workspace initial={initial.ready} api={api} email={email} onSignOut={onSignOut} />;
}

function Workspace({
  initial,
  api,
  email,
  onSignOut,
}: { initial: Boot; api: EditorApi } & Account) {
  const repository = initial.repository;
  const [index, setIndex] = useState(repository.index);
  const params = useParams({ strict: false });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routerNavigate = useNavigate();

  const location =
    pathname === "/"
      ? initial.location
      : params.serviceId
        ? { serviceId: params.serviceId, documentId: params.documentId }
        : undefined;

  const [panes, setPanes] = useState(initial.panes);
  const [dialog, setDialog] = useState<"service" | "rename" | "document">();
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const service = index.services.find((item) => item.id === location?.serviceId);
  const selected = service?.documents.find((item) => item.id === location?.documentId);
  const current = panes.find((pane) => pane.document.id === selected?.id);

  const missing = !!location && (!service || (!!location.documentId && !selected));

  useBlocker({
    enableBeforeUnload: () => {
      try {
        flushDocument(current?.store);

        return false;
      } catch {
        return true;
      }
    },
    shouldBlockFn: ({ next }) => {
      try {
        flushDocument(current?.store);

        if (next.routeId === "/_workspace/services/$serviceId/$documentId") {
          const document = repository.index.services
            .find((item) => item.id === next.params.serviceId)
            ?.documents.find((item) => item.id === next.params.documentId);

          if (document && !panes.some((pane) => pane.document.id === document.id)) {
            const store = openDocument(document, browserDraftStorage);
            setPanes((previous) =>
              previous.some((pane) => pane.document.id === document.id)
                ? previous
                : [...previous, { document, store }],
            );
          }
        }

        setDialog(undefined);
        setError("");

        return false;
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "The document could not be opened. Try again.",
        );

        return true;
      }
    },
  });

  useEffect(() => {
    if (pathname === "/")
      void routerNavigate({ ...workspaceLink(initial.location), replace: true });
  }, [pathname, routerNavigate, initial.location]);

  const navigate = (next: WorkspaceLocation) => routerNavigate(workspaceLink(next));

  const openDialog = (next: "service" | "rename" | "document") => {
    try {
      flushDocument(current?.store);
      setDialog(next);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Save this draft before continuing");
    }
  };

  const refresh = () => setIndex(repository.index);

  const signOut = async () => {
    try {
      flushDocument(current?.store);
      setSigningOut(true);
      const failure = await onSignOut();

      if (failure) setError(failure);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Save or download this draft before signing out.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="isolate flex min-h-dvh flex-col bg-grey-10 text-ink">
      <a
        href="#workspace-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
        className="sr-only z-50 bg-white px-4 py-3 focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
      >
        Skip to content
      </a>
      <header className="flex min-h-14 flex-wrap items-center gap-3 bg-brand-dark px-4 py-2 text-14 font-semibold text-white sm:px-6">
        <span
          className="h-6 shrink-0 [&>svg]:h-full [&>svg]:w-auto"
          aria-label="GovBB"
          dangerouslySetInnerHTML={{ __html: logo }}
        />
        <Link
          to="/services"
          className="rounded-sm px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
        >
          Services
        </Link>
        {service && (
          <>
            <span aria-hidden="true" className="text-blue-20">
              /
            </span>
            <span className="min-w-0 max-w-100 truncate">{service.title}</span>
          </>
        )}
        <Button
          className="ms-auto text-white hover:text-white"
          onClick={() => openDialog("service")}
        >
          Create service
        </Button>
        <span className="max-w-64 truncate text-14" title={email}>
          {email}
        </span>
        <Button
          className="text-white hover:text-white"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </header>
      {error && (
        <div role="alert" className="border-s-4 border-error bg-white px-6 py-3 text-error">
          {error}
        </div>
      )}
      <div
        className={
          service
            ? "grid flex-1 grid-cols-[15rem_minmax(0,1fr)] max-lg:grid-cols-1"
            : "flex flex-1 flex-col"
        }
      >
        {service && (
          <aside className="border-e border-line bg-white px-4 py-5 max-lg:border-e-0 max-lg:border-b">
            <details open>
              <summary className="cursor-pointer font-semibold">Service documents</summary>
              <nav aria-label="Service documents" className="mt-4">
                <h2 className="mb-2 text-14 font-semibold text-muted">Pages</h2>
                <ul className="flex flex-col gap-1">
                  {service.documents.flatMap((document) =>
                    document.kind === "page"
                      ? [
                          <li key={document.id}>
                            <Link
                              to="/services/$serviceId/$documentId"
                              params={{ serviceId: service.id, documentId: document.id }}
                              aria-current={selected?.id === document.id ? "page" : undefined}
                              className="block rounded-sm px-3 py-2 text-14 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-blue-10 aria-[current=page]:font-semibold"
                            >
                              <DocumentLabel
                                document={document}
                                store={
                                  panes.find((pane) => pane.document.id === document.id)?.store
                                }
                              />
                            </Link>
                          </li>,
                        ]
                      : [],
                  )}
                </ul>
                {!service.documents.some((document) => document.kind === "page") && (
                  <p className="py-2 text-14 text-muted">
                    Add an entry page to explain this service.
                  </p>
                )}
                <div className="my-4 border-t border-line" />
                {service.documents.flatMap((document) =>
                  document.kind === "form"
                    ? [
                        <Link
                          key={document.id}
                          to="/services/$serviceId/$documentId"
                          params={{ serviceId: service.id, documentId: document.id }}
                          aria-current={selected?.id === document.id ? "page" : undefined}
                          className="block rounded-sm px-3 py-2 text-14 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus aria-[current=page]:bg-blue-10 aria-[current=page]:font-semibold"
                        >
                          <DocumentLabel
                            document={document}
                            store={panes.find((pane) => pane.document.id === document.id)?.store}
                          />
                        </Link>,
                      ]
                    : [],
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => openDialog("document")}>
                    Add document
                  </Button>
                  <Button onClick={() => openDialog("rename")}>Rename service</Button>
                </div>
              </nav>
            </details>
          </aside>
        )}
        <main id="workspace-content" tabIndex={-1} className="min-w-0 outline-none">
          {missing && (
            <section className="p-8">
              <h1 className="text-28 font-semibold">Document not found</h1>
              <p role="alert" className="my-3 text-muted">
                This service or document is not in this browser's workspace.
              </p>
              <Link to="/services" className="text-interactive underline underline-offset-4">
                Back to services
              </Link>
            </section>
          )}
          {!service && !missing && (
            <section className="mx-auto w-full max-w-300 px-6 py-10">
              <h1 className="text-32 font-semibold tracking-tight">Services</h1>
              <p className="mt-1 mb-6 text-16 text-muted">Every service in the content API.</p>
              <ServicesList api={api} />
              {index.services.length > 0 && (
                <>
                  <h2 className="mt-12 text-20 font-semibold">Drafts in this browser</h2>
                  <p className="mt-1 text-16 text-muted">
                    Write the pages and build the form for each service in one place.
                  </p>
                </>
              )}
              <ul className="mt-4 divide-y divide-line rounded-sm bg-white shadow-sheet empty:hidden">
                {index.services.map((item) => (
                  <li key={item.id}>
                    <Link
                      {...workspaceLink({ serviceId: item.id, documentId: item.documents[0]?.id })}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-tint"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-sm bg-tint text-muted"
                      >
                        <PencilSimpleLine className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-15 font-semibold">{item.title}</span>
                        <span className="block text-13 text-muted tabular-nums">
                          {item.documents.length}{" "}
                          {item.documents.length === 1 ? "document" : "documents"}
                        </span>
                      </span>
                      <CaretRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {service && !selected && !missing && (
            <section className="p-8">
              <h1 className="text-28 font-semibold">{service.title}</h1>
              <p className="my-3 text-muted">Choose a document or add one to this service.</p>
              <Button variant="accent" onClick={() => openDialog("document")}>
                Add document
              </Button>
            </section>
          )}
          {panes.map((pane) => (
            <section
              key={pane.document.id}
              hidden={pane.document.id !== selected?.id}
              inert={pane.document.id !== selected?.id}
              aria-label={documentLabel(pane.document)}
            >
              {pane.document.kind === "form" ? (
                <WorkspaceFormEditor
                  store={pane.store}
                  active={pane.document.id === selected?.id}
                />
              ) : (
                <PageDraftEditor store={pane.store} active={pane.document.id === selected?.id} />
              )}
            </section>
          ))}
        </main>
      </div>
      {dialog === "service" && (
        <ServiceDialog
          repository={repository}
          close={() => setDialog(undefined)}
          done={(created) => {
            refresh();
            setDialog(undefined);
            navigate({ serviceId: created.id, documentId: created.documents[0]?.id });
          }}
        />
      )}
      {dialog === "rename" && service && (
        <ServiceDialog
          repository={repository}
          service={service}
          close={() => setDialog(undefined)}
          done={() => {
            refresh();
            setDialog(undefined);
          }}
        />
      )}
      {dialog === "document" && service && (
        <DocumentDialog
          repository={repository}
          service={service}
          close={() => setDialog(undefined)}
          done={(document) => {
            refresh();
            setDialog(undefined);
            navigate({ serviceId: service.id, documentId: document.id });
          }}
        />
      )}
    </div>
  );
}
