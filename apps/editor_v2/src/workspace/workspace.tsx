import logo from "@govtech-bb/frontend/assets/images/govbb-logo.svg?raw";
import { Files, List } from "@phosphor-icons/react";
import {
  Link,
  useMatch,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiFailure, type EditorApi } from "../api/client";
import { rolesQuery, serviceQuery, servicesQuery, estateVersionQuery } from "../api/queries";
import {
  CreateRemotePageDialog,
  CreateRemoteServiceDialog,
  DeleteRemotePageDialog,
} from "./remote-page-dialogs";
import { RemotePagePane } from "./remote-page-pane";
import { AppNav } from "./app-nav";
import { CollectionScreen, CollectionsScreen } from "./collections";
import { CategoriesScreen } from "./categories-screen";
import { listedServiceRows, remoteServiceRows } from "./service-pages";
import { ServiceNav } from "./service-nav";
import { workspaceLink } from "./navigation";
import { Banner } from "../ui/banner";
import { Bar } from "../ui/bar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { TextLink } from "../ui/text-link";
import { Sidebar, useSidebar } from "../ui/sidebar";
import { useScreenPlace } from "./screen-place";
import { ScreenTitle } from "./screen-title";
import { DocumentSessions, keptViews } from "./document-views";
import { ServicesList } from "./services-list";
import type { ServicesSearch } from "./services-search";
import type { WorkspaceLocation } from "./model";
import { pageHasUnsavedChanges, type PageSession } from "./page-sync";
import { usePageLeaveGuard } from "./page-leave-guard";

type Account = {
  email: string;
  onSignOut: () => Promise<string | undefined>;
  notice?: string;
};

const SIDEBAR_KEY = "govbb-editor:sidebar-collapsed";

// The bar's trail of links, light on dark
const crumb =
  "rounded-sm px-2 py-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus";

/** What someone without the editor role is told, on every screen. */
const READ_ONLY =
  "You can read pages and categories but not change them, because you don't have the editor role. Ask an admin to give it to you.";

/** Authenticated API services and page editors; no browser-local workspace is loaded. */
export function ServiceWorkspace({ api, email, onSignOut, notice }: Account & { api: EditorApi }) {
  const params = useParams({ strict: false });
  const href = useRouterState({ select: (state) => state.location.href });
  const routerNavigate = useNavigate();
  const listSearch = useSearch({ from: "/_workspace/services", shouldThrow: false });
  const onCategories = !!useMatch({ from: "/_workspace/categories", shouldThrow: false });
  const onCollections = !!useMatch({ from: "/_workspace/collections", shouldThrow: false });

  const collectionSearch = useSearch({
    from: "/_workspace/collections/$key",
    shouldThrow: false,
  });

  const collectionKey = onCollections ? params.key : undefined;
  const [servicesSearch, setServicesSearch] = useState<ServicesSearch>({});

  const location = params.serviceId
    ? { serviceId: params.serviceId, documentId: params.documentId }
    : undefined;

  const documentId = location?.documentId;
  const [panes, setPanes] = useState<string[]>(() => (documentId ? [documentId] : []));
  const [sessions] = useState(() => new DocumentSessions());

  const [pageSessions, setPageSessions] = useState<ReadonlyMap<string, PageSession>>(
    () => new Map(),
  );

  const pageSessionsRef = useRef(pageSessions);
  const getPages = useCallback(() => pageSessionsRef.current, []);

  const trackPageSession = useCallback((id: string, session: PageSession | undefined) => {
    if (pageSessionsRef.current.get(id) === session) return;
    const next = new Map(pageSessionsRef.current);

    if (session) next.set(id, session);
    else next.delete(id);
    pageSessionsRef.current = next;
    setPageSessions(next);
  }, []);

  const discardPages = useCallback(
    (ids: readonly string[]) => {
      const next = new Map(pageSessionsRef.current);

      for (const id of ids) {
        next.delete(id);
        sessions.forget(id);
      }

      pageSessionsRef.current = next;
      setPageSessions(next);
      setPanes((previous) => previous.filter((id) => !ids.includes(id)));
    },
    [sessions],
  );

  const stores = useMemo(
    () => new Map([...pageSessions].map(([id, session]) => [id, session.store])),
    [pageSessions],
  );

  useEffect(() => {
    if (!documentId) return;

    const kept = keptViews(panes, documentId, (id) => {
      const page = pageSessions.get(id);

      return !page || (!pageHasUnsavedChanges(page) && !page.isSaving());
    });

    if (kept.length === panes.length && kept.every((id, index) => panes[index] === id)) return;

    for (const id of panes.filter((id) => !kept.includes(id))) {
      const page = pageSessions.get(id);

      if (page) sessions.close(id, page.getBaseline().page.updated_at);
    }

    setPanes(kept);
  }, [documentId, panes, pageSessions, sessions]);
  useEffect(() => {
    setDialog(undefined);
  }, [documentId]);

  const [dialog, setDialog] = useState<"service" | "page" | "delete">();
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const sidebar = useSidebar(SIDEBAR_KEY);
  // Always beside the page on a wide screen, so nothing about it is remembered
  const appNav = useSidebar();
  const client = useQueryClient();
  useQuery({ ...estateVersionQuery(api, client), notifyOnChangeProps: [] });

  const remote = useQuery({
    ...serviceQuery(api, location?.serviceId ?? ""),
    enabled: !!location,
  });

  const listed = useQuery({ ...servicesQuery(api), enabled: false }).data?.find(
    (item) => item.id === location?.serviceId,
  );

  const roles = useQuery(rolesQuery(api)).data;
  // Until the roles load, deleting a public page waits rather than offering what the API may refuse
  const approver = roles?.includes("approver") ?? false;
  // Without the editor role everything still reads, but nothing can be changed. Until the roles load everyone is
  // offered the changes, since nearly everyone is an editor; the API refuses anyone who isn't
  const readOnly = !!roles && !roles.includes("editor");

  const rows = useMemo(() => (remote.data ? remoteServiceRows(remote.data) : []), [remote.data]);
  const selected = rows.find((row) => row.document.id === documentId)?.document;

  const missing =
    !!location &&
    ((remote.error instanceof ApiFailure && remote.error.status === 404) ||
      (!!remote.data && !!documentId && !selected));

  const place = useScreenPlace(
    remote.data,
    selected,
    documentId ? stores.get(documentId) : undefined,
  );

  const serviceName = place.service ?? listed?.title;
  const serviceStatus = remote.error instanceof ApiFailure ? remote.error.status : undefined;

  const serviceRecovery =
    serviceStatus === 401 ? (
      <Button
        variant="secondary"
        onClick={() =>
          void routerNavigate({
            to: "/auth",
            search: { state: "sign-in", returnTo: href, reason: "provider" },
          })
        }
      >
        Sign in again
      </Button>
    ) : (
      <Button variant="secondary" pending={remote.isFetching} onClick={() => void remote.refetch()}>
        {remote.isFetching ? "Refreshing service…" : "Try again"}
      </Button>
    );

  // A record's dialog lives in the collection's address, so a page's block can link straight to it
  const openRecord = useCallback(
    (record: string | undefined) => {
      if (collectionKey)
        void routerNavigate({
          to: "/collections/$key",
          params: { key: collectionKey },
          search: record ? { record } : {},
          replace: true,
        });
    },
    [collectionKey, routerNavigate],
  );

  const navigate = (next: WorkspaceLocation) =>
    routerNavigate(next ? workspaceLink(next) : { to: "/services", search: servicesSearch });

  const signOut = async () => {
    setSigningOut(true);

    try {
      const failure = await onSignOut();

      if (failure) setError(failure);
    } finally {
      setSigningOut(false);
    }
  };

  const leave = usePageLeaveGuard({
    getPages,
    activeId: documentId,
    discard: discardPages,
    onSignOut: signOut,
  });

  return (
    <div className="isolate flex min-h-dvh flex-col bg-grey-10 text-ink">
      <ScreenTitle
        names={
          missing
            ? ["Document not found"]
            : location
              ? [place.document, serviceName]
              : [onCategories ? "Categories" : onCollections ? "Collections" : "Services"]
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
          {!appNav.wide && (
            <Sidebar.Toggle sidebar={appNav} variant="inverse" icon={<List />}>
              Menu
            </Sidebar.Toggle>
          )}
          <span
            className="h-6 shrink-0 [&>svg]:h-full [&>svg]:w-auto"
            aria-label="GovBB"
            dangerouslySetInnerHTML={{ __html: logo }}
          />
          {/* Where the trail starts: always the same link, so it keeps the focus as it changes screens */}
          {onCategories ? (
            <Link to="/categories" className={crumb}>
              Categories
            </Link>
          ) : onCollections ? (
            <Link to="/collections" className={crumb}>
              Collections
            </Link>
          ) : (
            <Link to="/services" search={servicesSearch} className={crumb}>
              Services
            </Link>
          )}
          {serviceName && (
            <>
              <span aria-hidden="true" className="text-blue-20">
                /
              </span>
              <span className="min-w-0 max-w-100 truncate">{serviceName}</span>
              <Sidebar.Toggle sidebar={sidebar} variant="inverse">
                Pages
              </Sidebar.Toggle>
            </>
          )}
          <Bar.Actions>
            <Bar.Status className="max-w-64 truncate font-normal" title={email}>
              {email}
            </Bar.Status>
            <Button variant="inverse" disabled={signingOut} onClick={leave.requestSignOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </Bar.Actions>
        </Bar.Root>
      </header>
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
      {readOnly && (
        <Banner tone="info" layout="strip">
          {READ_ONLY}
        </Banner>
      )}
      <div className="flex flex-1">
        <AppNav sidebar={appNav} rail={!!location} servicesSearch={servicesSearch} />
        {location && !missing && (remote.data || remote.isPending) && (
          <ServiceNav
            sidebar={sidebar}
            serviceId={location.serviceId}
            rows={remote.data ? rows : listed ? listedServiceRows(listed) : []}
            loading={!remote.data}
            selectedId={documentId}
            stores={stores}
            onAdd={() => setDialog("page")}
            onDelete={() => setDialog("delete")}
            readOnly={readOnly ? "You need the editor role to add or delete pages." : undefined}
            deleteBlocked={
              selected && remote.data?.pages.some((page) => page.parent_id === selected.id)
                ? "Delete or move the pages under this page first."
                : !approver &&
                    remote.data?.pages.find((page) => page.id === selected?.id)?.visibility ===
                      "public"
                  ? "Only approvers can delete a public page."
                  : undefined
            }
          />
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
          {!missing && location && remote.isPending && (
            <LoadingState size="page" label={documentId ? "Loading page…" : "Loading service…"} />
          )}
          {!missing && location && remote.isError && remote.data && (
            <Banner
              tone={serviceStatus === 401 || serviceStatus === 403 ? "error" : "warning"}
              layout="strip"
              actions={serviceRecovery}
            >
              {serviceStatus === 401
                ? "Your session has ended. Download unsaved changes before signing in again."
                : serviceStatus === 403
                  ? "You no longer have access to this service. Download a copy to keep any unsaved changes."
                  : "We could not refresh this service. Showing the last loaded version; your edits are unchanged."}
            </Banner>
          )}
          {!missing && location && remote.isError && !remote.data && (
            <EmptyState
              kind="failed"
              size="page"
              title="We could not load this service"
              description={
                serviceStatus === 401
                  ? "Your session has ended. Sign in again to load this service."
                  : serviceStatus === 403
                    ? "You do not have access to this service."
                    : "Check your connection, then try again."
              }
              actions={serviceRecovery}
            />
          )}
          {!location && onCategories && (
            <section className="mx-auto w-full max-w-300 px-6 py-10">
              <CategoriesScreen api={api} readOnly={readOnly} />
            </section>
          )}
          {!location && onCollections && (
            <section className="mx-auto w-full max-w-300 px-6 py-10">
              {collectionKey ? (
                <CollectionScreen
                  api={api}
                  collectionKey={collectionKey}
                  record={collectionSearch?.record}
                  onRecord={openRecord}
                  readOnly={readOnly}
                />
              ) : (
                <CollectionsScreen api={api} />
              )}
            </section>
          )}
          {!location && !onCategories && !onCollections && (
            <section className="mx-auto w-full max-w-300 px-6 py-10">
              <ServicesList
                api={api}
                search={listSearch ?? {}}
                onSearch={(search) => {
                  setServicesSearch(search);
                  void routerNavigate({ to: "/services", search, replace: true });
                }}
                onCreate={() => setDialog("service")}
                readOnly={readOnly}
              />
            </section>
          )}
          {!missing && remote.data && location && !documentId && (
            <EmptyState
              size="page"
              icon={<Files />}
              title={remote.data.service.title}
              description="Choose a document or add one to this service."
              actions={
                <Button variant="accent" disabled={readOnly} onClick={() => setDialog("page")}>
                  Add document
                </Button>
              }
            />
          )}
          {panes.map((id) => (
            <section
              key={id}
              hidden={missing || id !== selected?.id}
              inert={missing || id !== selected?.id}
              aria-label={
                rows.find((row) => row.document.id === id)?.document.title ??
                "Page from the content API"
              }
            >
              <RemotePagePane
                api={api}
                id={id}
                active={!missing && id === selected?.id}
                onSession={trackPageSession}
                sessions={sessions}
              />
            </section>
          ))}
        </main>
      </div>
      {leave.dialog}
      {dialog === "service" && (
        <CreateRemoteServiceDialog
          api={api}
          close={() => setDialog(undefined)}
          done={(id) => {
            setDialog(undefined);
            void navigate({ serviceId: id, documentId: id });
          }}
        />
      )}
      {dialog === "page" && remote.data && location && (
        <CreateRemotePageDialog
          api={api}
          detail={remote.data}
          close={() => setDialog(undefined)}
          done={(id) => {
            setDialog(undefined);
            void navigate({ serviceId: location.serviceId, documentId: id });
          }}
        />
      )}
      {dialog === "delete" && selected && location && (
        <DeleteRemotePageDialog
          api={api}
          page={selected}
          close={() => setDialog(undefined)}
          done={() => {
            const deleted = selected.id;
            setDialog(undefined);
            discardPages([deleted]);
            void navigate(
              deleted === location.serviceId
                ? undefined
                : { serviceId: location.serviceId, documentId: location.serviceId },
            );
          }}
        />
      )}
    </div>
  );
}
