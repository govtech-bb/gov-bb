import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw";
import { Files } from "@phosphor-icons/react";
import { Link, useBlocker, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ApiFailure, type EditorApi } from "../api/client";
import { serviceQuery, servicesQuery, estateVersionQuery } from "../api/queries";
import { EditorSessionProvider } from "../editor/react/composer";
import {
  CreateRemotePageDialog,
  CreateRemoteServiceDialog,
  DeleteRemotePageDialog,
} from "./remote-page-dialogs";
import { RemotePagePane } from "./remote-page-pane";
import {
  browserFormFor,
  listedServiceRows,
  localServiceRows,
  remoteServiceRows,
} from "./service-pages";
import { ServiceNav } from "./service-nav";
import { workspaceLink } from "./navigation";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { TextLink } from "../ui/text-link";
import { Sidebar, useSidebar } from "../ui/sidebar";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { useScreenPlace } from "./screen-place";
import { ScreenTitle } from "./screen-title";
import type { DraftStore } from "../persistence/draft-store";
import { AddLocalDocumentDialog, LocalServiceDialog } from "./local-document-dialogs";
import { openDocument, openWorkspace } from "./documents";
import { DocumentSessions, keptViews } from "./document-views";
import { WorkspaceFormEditor } from "./form-editor";
import { ServicesList } from "./services-list";
import type { ServicesSearch } from "./services-search";
import {
  documentKeys,
  documentLabel,
  flushDocument,
  localDocumentAt,
  WORKSPACE_KEY,
  type WorkspaceDocument,
  type WorkspaceLocation,
  type WorkspaceRepository,
} from "./model";

type Account = {
  email: string;
  onSignOut: () => Promise<string | undefined>;
  /** A problem with the app from outside the workspace, such as a session that couldn't be checked. */
  notice?: string;
};

// Where this browser remembers that the author collapsed the service sidebar
const SIDEBAR_KEY = "govbb-editor:sidebar-collapsed";

type OpenDocument = { document: WorkspaceDocument; store: DraftStore };

type Boot = { repository: WorkspaceRepository; location: WorkspaceLocation; panes: OpenDocument[] };

function boot(location: WorkspaceLocation): Boot {
  const { repository } = openWorkspace(browserDraftStorage, Object.keys(window.localStorage));

  const document = localDocumentAt(repository.index, location);

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
export function ServiceWorkspace({ api, email, onSignOut, notice }: Account & { api: EditorApi }) {
  const params = useParams({ strict: false });

  const [initial] = useState(() => {
    try {
      return {
        ready: boot(
          params.serviceId
            ? { serviceId: params.serviceId, documentId: params.documentId }
            : undefined,
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
      <main className="text-ink">
        <ScreenTitle names={["We could not open the service workspace"]} />
        <EmptyState
          kind="failed"
          size="page"
          title="We could not open the service workspace"
          description={
            <>
              <p>{initial.error}</p>
              <p className="mt-2">
                Existing drafts have been kept. Download the service list before repairing it.
              </p>
            </>
          }
          actions={
            <>
              <Button onClick={downloadWorkspace}>Download service list</Button>
              <Button onClick={() => window.location.reload()}>Try again</Button>
            </>
          }
        />
      </main>
    );

  return (
    <Workspace
      initial={initial.ready}
      api={api}
      email={email}
      onSignOut={onSignOut}
      notice={notice}
    />
  );
}

function Workspace({
  initial,
  api,
  email,
  onSignOut,
  notice,
}: { initial: Boot; api: EditorApi } & Account) {
  const repository = initial.repository;
  const [index, setIndex] = useState(repository.index);
  const params = useParams({ strict: false });
  const routerNavigate = useNavigate();
  const listSearch = useSearch({ from: "/_workspace/services", shouldThrow: false });

  // Where the author last was in the Services list, for every way back to it
  const [servicesSearch, setServicesSearch] = useState<ServicesSearch>({});

  const location = params.serviceId
    ? { serviceId: params.serviceId, documentId: params.documentId }
    : undefined;

  const [panes, setPanes] = useState(initial.panes);

  // Pages from the content API, kept mounted once visited like the browser's own documents.
  const [apiPanes, setApiPanes] = useState(() =>
    initial.location?.documentId &&
    !repository.index.services.some((item) => item.id === initial.location?.serviceId) &&
    !localDocumentAt(repository.index, initial.location)
      ? [initial.location.documentId]
      : [],
  );

  // The documents whose views are mounted, the one on screen first. The rest have closed, leaving their sessions.
  const [views, setViews] = useState(() =>
    initial.location?.documentId ? [initial.location.documentId] : [],
  );

  const [sessions] = useState(() => new DocumentSessions());

  // Their editors' drafts, once open, so the sidebar names each page as its draft has it
  const [apiStores, setApiStores] = useState<ReadonlyMap<string, DraftStore>>(() => new Map());

  const trackApiStore = useCallback(
    (id: string, store: DraftStore | undefined) =>
      setApiStores((previous) => {
        if (previous.get(id) === store) return previous;
        const next = new Map(previous);

        if (store) next.set(id, store);
        else next.delete(id);

        return next;
      }),
    [],
  );

  const stores = useMemo(
    () => new Map([...panes.map((pane) => [pane.document.id, pane.store] as const), ...apiStores]),
    [panes, apiStores],
  );

  const [dialog, setDialog] = useState<
    "service" | "rename" | "document" | "api-service" | "api-page" | "api-delete"
  >();

  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const sidebar = useSidebar(SIDEBAR_KEY);
  const service = index.services.find((item) => item.id === location?.serviceId);

  const client = useQueryClient();

  useQuery({ ...estateVersionQuery(api, client), notifyOnChangeProps: [] });

  const remote = useQuery({
    ...serviceQuery(api, location?.serviceId ?? ""),
    enabled: !!location && !service,
  });

  // What the services list, once loaded, says of the service, to draw its sidebar and name it while it loads
  const listed = useQuery({ ...servicesQuery(api), enabled: false }).data?.find(
    (item) => item.id === location?.serviceId,
  );

  // The service's form, when this browser drafts it, is listed with the service's pages
  const joinedForm = useMemo(
    () => remote.data && browserFormFor(index, remote.data.service.form_id),
    [index, remote.data],
  );

  const remoteRows = useMemo(
    () => (remote.data ? remoteServiceRows(remote.data, joinedForm) : []),
    [remote.data, joinedForm],
  );

  const remoteDocuments = useMemo(
    () => remoteRows.flatMap((row) => (row.document.kind === "page" ? [row.document] : [])),
    [remoteRows],
  );

  const remoteSelected = remoteDocuments.find((item) => item.id === location?.documentId);

  const selected = service
    ? service.documents.find((item) => item.id === location?.documentId)
    : joinedForm && joinedForm.id === location?.documentId
      ? joinedForm
      : undefined;

  const current = panes.find((pane) => pane.document.id === selected?.id);

  const missing =
    !!location &&
    (service
      ? !!location.documentId && !selected
      : (remote.error instanceof ApiFailure && remote.error.status === 404) ||
        (!!remote.data && !!location.documentId && !remoteSelected && !selected));

  const place = useScreenPlace(
    { service, document: selected, store: current?.store },
    { service: remote.data, document: remoteSelected },
  );

  const serviceName = place.service ?? listed?.title;

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
          const { serviceId, documentId } = next.params;
          const local = repository.index.services.some((item) => item.id === serviceId);
          const document = localDocumentAt(repository.index, { serviceId, documentId });
          const opened = document?.id ?? (local ? undefined : documentId);

          // How a document's draft is saved, which tells a closed view's session whether it still fits on return
          const saved = (id: string) => {
            const draft =
              id === document?.id
                ? document
                : panes.find((pane) => pane.document.id === id)?.document;

            return browserDraftStorage.getItem((draft?.keys ?? documentKeys(id)).committed);
          };

          if (opened) {
            // Views beyond the few most recent close once their drafts are saved, keeping their sessions for later
            const kept = keptViews(views, opened, (id) => {
              try {
                flushDocument(stores.get(id));

                return true;
              } catch {
                return false;
              }
            });

            const closed = new Set(views.filter((id) => !kept.includes(id)));

            for (const id of closed) sessions.close(id, saved(id));
            sessions.open(opened, saved(opened));
            setViews(kept);
            setPanes((previous) => previous.filter((pane) => !closed.has(pane.document.id)));
            setApiPanes((previous) => previous.filter((id) => !closed.has(id)));
          }

          if (!local && !document && documentId)
            setApiPanes((previous) =>
              previous.includes(documentId) ? previous : [...previous, documentId],
            );

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

  const navigate = (next: WorkspaceLocation) =>
    routerNavigate(next ? workspaceLink(next) : { to: "/services", search: servicesSearch });

  const openDialog = (
    next: "service" | "rename" | "document" | "api-service" | "api-page" | "api-delete",
  ) => {
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
      <ScreenTitle
        names={
          missing ? ["Document not found"] : location ? [place.document, serviceName] : ["Services"]
        }
      />
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
      <header>
        <Bar.Root tone="dark" className="font-semibold">
          <span
            className="h-6 shrink-0 [&>svg]:h-full [&>svg]:w-auto"
            aria-label="GovBB"
            dangerouslySetInnerHTML={{ __html: logo }}
          />
          <Link
            to="/services"
            search={servicesSearch}
            className="rounded-sm px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          >
            Services
          </Link>
          {serviceName && (
            <>
              <span aria-hidden="true" className="text-blue-20">
                /
              </span>
              <span className="min-w-0 max-w-100 truncate">{serviceName}</span>
            </>
          )}
          {serviceName && (
            <Sidebar.Toggle sidebar={sidebar} variant="inverse">
              Pages
            </Sidebar.Toggle>
          )}
          <Bar.Actions>
            <Bar.Status className="max-w-64 truncate font-normal" title={email}>
              {email}
            </Bar.Status>
            <Button variant="inverse" disabled={signingOut} onClick={() => void signOut()}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </Bar.Actions>
        </Bar.Root>
      </header>
      {/* The app's problems, all here under its header (Banner) */}
      {notice && (
        <Banner tone="error" layout="strip">
          {notice}
        </Banner>
      )}
      {error && (
        <Banner tone="error" layout="strip">
          {error}
        </Banner>
      )}
      <div className="flex flex-1">
        {service ? (
          <ServiceNav
            sidebar={sidebar}
            serviceId={service.id}
            rows={localServiceRows(service)}
            selectedId={selected?.id}
            stores={stores}
            onAdd={() => openDialog("document")}
            onRename={() => openDialog("rename")}
          />
        ) : (
          location &&
          !missing &&
          (remote.data || remote.isPending) && (
            // Drawn at once, with what the services list knows until the service's pages arrive
            <ServiceNav
              sidebar={sidebar}
              serviceId={location.serviceId}
              rows={remote.data ? remoteRows : listed ? listedServiceRows(listed) : []}
              loading={!remote.data}
              selectedId={location.documentId}
              stores={stores}
              onAdd={() => openDialog("api-page")}
              onDelete={() => openDialog("api-delete")}
              // The API refuses to delete a page with pages under it, so say so before the author confirms
              deleteBlocked={
                remoteSelected &&
                remote.data?.pages.some((page) => page.parent_id === remoteSelected.id)
                  ? "Delete or move the pages under this page first."
                  : undefined
              }
            />
          )
        )}
        <main id="workspace-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {missing && (
            <EmptyState
              kind="not-found"
              size="page"
              title="Document not found"
              description="It may have been deleted, or the address may be wrong."
              actions={
                <TextLink render={<Link to="/services" search={servicesSearch} />}>
                  Back to services
                </TextLink>
              }
            />
          )}
          {!service && !missing && location && remote.isPending && (
            <LoadingState size="page" label="Loading service…" />
          )}
          {!service && !missing && remote.isError && (
            <EmptyState
              kind="failed"
              size="page"
              title="We could not load this service"
              description="Check you are still signed in, then try again."
              actions={
                <Button variant="secondary" onClick={() => void remote.refetch()}>
                  Try again
                </Button>
              }
            />
          )}
          {!location && (
            <section className="mx-auto w-full max-w-300 px-6 py-10">
              <ServicesList
                api={api}
                search={listSearch ?? {}}
                onSearch={(search) => {
                  setServicesSearch(search);
                  void routerNavigate({ to: "/services", search, replace: true });
                }}
                onCreate={() => openDialog("api-service")}
              />
              {index.services.length > 0 && (
                <div className="mt-12 mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-20 font-semibold">Drafts in this browser</h2>
                  <Button variant="secondary" onClick={() => openDialog("service")}>
                    Create browser draft
                  </Button>
                </div>
              )}
              <ul className="rounded-sm bg-white px-3 py-2 shadow-sheet empty:hidden">
                {index.services.map((item) => (
                  <li key={item.id}>
                    <Link
                      {...workspaceLink({ serviceId: item.id, documentId: item.documents[0]?.id })}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-sm px-3 py-2 hover:bg-tint"
                    >
                      <span className="truncate text-14 font-semibold text-ink">{item.title}</span>
                      <span className="text-14 text-muted tabular-nums">
                        {item.documents.length}{" "}
                        {item.documents.length === 1 ? "document" : "documents"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {service && !selected && !missing && (
            <EmptyState
              size="page"
              icon={<Files />}
              title={service.title}
              description="Choose a document or add one to this service."
              actions={
                <Button variant="accent" onClick={() => openDialog("document")}>
                  Add document
                </Button>
              }
            />
          )}
          {!service && remote.data && !location?.documentId && (
            <EmptyState
              size="page"
              icon={<Files />}
              title={remote.data.service.title}
              description="Choose a document or add one to this service."
              actions={
                <Button variant="accent" onClick={() => openDialog("api-page")}>
                  Add document
                </Button>
              }
            />
          )}
          {apiPanes.map((id) => (
            <section
              key={id}
              hidden={id !== remoteSelected?.id}
              inert={id !== remoteSelected?.id}
              aria-label={
                remoteDocuments.find((item) => item.id === id)?.title ?? "Page from the content API"
              }
            >
              <EditorSessionProvider session={sessions.get(id)}>
                <RemotePagePane
                  api={api}
                  id={id}
                  active={id === remoteSelected?.id}
                  onStore={trackApiStore}
                />
              </EditorSessionProvider>
            </section>
          ))}
          {panes.map((pane) => (
            <section
              key={pane.document.id}
              hidden={pane.document.id !== selected?.id}
              inert={pane.document.id !== selected?.id}
              aria-label={documentLabel(pane.document)}
            >
              <EditorSessionProvider session={sessions.get(pane.document.id)}>
                {pane.document.kind === "form" ? (
                  <WorkspaceFormEditor
                    store={pane.store}
                    active={pane.document.id === selected?.id}
                  />
                ) : (
                  <PageDraftEditor store={pane.store} active={pane.document.id === selected?.id} />
                )}
              </EditorSessionProvider>
            </section>
          ))}
        </main>
      </div>
      {dialog === "service" && (
        <LocalServiceDialog
          repository={repository}
          close={() => setDialog(undefined)}
          done={(created) => {
            refresh();
            setDialog(undefined);
            navigate({ serviceId: created.id, documentId: created.documents[0]?.id });
          }}
        />
      )}
      {dialog === "api-service" && (
        <CreateRemoteServiceDialog
          api={api}
          close={() => setDialog(undefined)}
          done={(id) => {
            setDialog(undefined);
            navigate({ serviceId: id, documentId: id });
          }}
        />
      )}
      {dialog === "api-page" && remote.data && location && (
        <CreateRemotePageDialog
          api={api}
          detail={remote.data}
          close={() => setDialog(undefined)}
          done={(id) => {
            setDialog(undefined);
            navigate({ serviceId: location.serviceId, documentId: id });
          }}
        />
      )}
      {dialog === "api-delete" && remoteSelected && location && (
        <DeleteRemotePageDialog
          api={api}
          page={remoteSelected}
          close={() => setDialog(undefined)}
          done={() => {
            const deleted = remoteSelected.id;
            setDialog(undefined);
            setApiPanes((previous) => previous.filter((id) => id !== deleted));
            setViews((previous) => previous.filter((id) => id !== deleted));
            sessions.forget(deleted);
            navigate(
              deleted === location.serviceId
                ? undefined
                : { serviceId: location.serviceId, documentId: location.serviceId },
            );
          }}
        />
      )}
      {dialog === "rename" && service && (
        <LocalServiceDialog
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
        <AddLocalDocumentDialog
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
