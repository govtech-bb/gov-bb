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
import { HistoryScreen } from "./history-screen";
import { ReviewQueueScreen, ReviewScreen } from "./review-screens";
import { listedServiceRows, remoteServiceRows } from "./service-pages";
import { ServiceNav } from "./service-nav";
import { workspaceLink } from "./navigation";
import { Banner } from "../ui/banner";
import { Bar, type Crumb } from "../ui/bar";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingState } from "../ui/loading-state";
import { TextLink } from "../ui/text-link";
import { Sidebar, useSidebar } from "../ui/sidebar";
import { useLatched } from "../ui/use-latched";
import { useScreenPlace } from "./screen-place";
import { ScreenTitle } from "./screen-title";
import { DocumentSessions, keptViews } from "./document-views";
import { GovbbLogo } from "./govbb-logo";
import { ServicesList } from "./services-list";
import type { ServicesSearch } from "./services-search";
import type { WorkspaceLocation } from "./model";
import { pageHasUnsavedChanges, type PageSession } from "./page-sync";
import { usePageLeaveGuard } from "./page-leave-guard";

type Account = {
  email: string;
  /** Whether the API lets someone decide on their own change: only for one local developer under the auth bypass. */
  selfApproval?: boolean;
  onSignOut: () => Promise<string | undefined>;
  notice?: string;
};

const SIDEBAR_KEY = "govbb-editor:sidebar-collapsed";

/** What someone without the editor role is told, on every screen. */
const READ_ONLY =
  "You can read pages, categories and collections but not change them, because you don’t have the editor role. Ask an admin to give it to you.";

/** Authenticated API services and page editors; no browser-local workspace is loaded. */
export function ServiceWorkspace({
  api,
  email,
  selfApproval,
  onSignOut,
  notice,
}: Account & { api: EditorApi }) {
  const params = useParams({ strict: false });
  const href = useRouterState({ select: (state) => state.location.href });
  const routerNavigate = useNavigate();
  const listSearch = useSearch({ from: "/_workspace/services", shouldThrow: false });
  const onCategories = !!useMatch({ from: "/_workspace/categories", shouldThrow: false });
  const onReviews = !!useMatch({ from: "/_workspace/reviews", shouldThrow: false });
  const reviewing = params.pageId;
  const historySearch = useSearch({ from: "/_workspace/history/$pageId", shouldThrow: false });
  const onHistory = !!historySearch;
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

      if (page) sessions.close(id, String(page.getBaseline().page.version));
    }

    setPanes(kept);
  }, [documentId, panes, pageSessions, sessions]);
  useEffect(() => {
    setDialog(null);
  }, [documentId]);

  const [dialog, setDialog] = useState<"service" | "page" | "delete" | null>(null);
  const shown = useLatched(dialog);
  // Remount on each opening to clear the previous form and request state.
  const [opened, setOpened] = useState(0);

  const openDialog = (kind: "service" | "page" | "delete") => {
    setOpened((count) => count + 1);
    setDialog(kind);
  };

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
  // Until the roles load, deleting a public page and changing categories wait rather than offering what the API may
  // refuse
  const approver = roles?.includes("approver") ?? false;
  // Without the editor role everything still reads, but nothing can be changed. Until the roles load everyone is
  // offered the changes, since nearly everyone is an editor; the API refuses anyone who isn't
  const readOnly = !!roles && !roles.includes("editor");

  const rows = useMemo(() => (remote.data ? remoteServiceRows(remote.data) : []), [remote.data]);
  const selected = rows.find((row) => row.document.id === documentId)?.document;
  const selectedSession = selected ? pageSessions.get(selected.id) : undefined;

  // The page being deleted and its editing session, kept while its dialog fades away after the page itself has gone
  const deleting = useLatched(
    dialog === "delete" && selected && selectedSession
      ? { page: selected, session: selectedSession }
      : null,
  );

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
  const servicePages = !!location && !missing && (!!remote.data || remote.isPending);

  // When the sidebar is hidden, move its toggle into the page bar so it stays reachable.
  const showPages =
    servicePages && !(sidebar.wide && sidebar.open) ? (
      <Sidebar.Toggle sidebar={sidebar} label="Pages" />
    ) : null;

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
      <Button
        variant="secondary"
        pending={remote.isFetching}
        pendingLabel="Refreshing service…"
        onClick={() => void remote.refetch()}
      >
        Try again
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

  const crumbs: Crumb[] = [
    onCategories
      ? { label: "Categories", render: <Link to="/categories" /> }
      : onReviews
        ? { label: "Review queue", render: <Link to="/reviews" /> }
        : onCollections
          ? { label: "Collections", render: <Link to="/collections" /> }
          : { label: "Services", render: <Link to="/services" search={servicesSearch} /> },
  ];

  if (serviceName)
    crumbs.push({ label: <span className="block max-w-100 truncate">{serviceName}</span> });

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
              : onReviews
                ? reviewing
                  ? ["Review change", "Review queue"]
                  : ["Review queue"]
                : onHistory
                  ? ["Page history"]
                  : [onCategories ? "Categories" : onCollections ? "Collections" : "Services"]
        }
      />
      <a
        href="#workspace-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
        className="sr-only z-popup bg-white px-4 py-3 focus:not-sr-only focus:fixed focus:start-2 focus:top-2"
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
          <GovbbLogo fit="height" className="h-6 shrink-0" />
          <Bar.Crumbs crumbs={crumbs} />
          <Bar.Actions>
            <Bar.Status className="max-w-64 truncate font-normal max-lg:hidden" title={email}>
              {email}
            </Bar.Status>
            <Button
              variant="inverse"
              pending={signingOut}
              pendingLabel="Signing out…"
              onClick={leave.requestSignOut}
            >
              Sign out
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
        {servicePages && (
          <ServiceNav
            sidebar={sidebar}
            serviceId={location.serviceId}
            rows={remote.data ? rows : listed ? listedServiceRows(listed) : []}
            loading={!remote.data}
            selectedId={documentId}
            stores={stores}
            onAdd={() => openDialog("page")}
            onDelete={() => openDialog("delete")}
            readOnly={readOnly ? "You need the editor role to add or delete pages." : undefined}
            deleteBlocked={
              selected && remote.data?.pages.some((page) => page.parent_id === selected.id)
                ? "Delete or move the pages under this page first."
                : !approver &&
                    remote.data?.pages.find((page) => page.id === selected?.id)?.visibility ===
                      "public"
                  ? "Only approvers can delete a public page."
                  : !selectedSession?.getEditLockToken() || selectedSession.isSaving()
                    ? "Confirm editing ownership and finish any pending save before deleting."
                    : undefined
            }
          />
        )}
        <main id="workspace-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {/* Keep the sidebar toggle reachable before a page is selected. */}
          {showPages && !selected && <Bar.Root>{showPages}</Bar.Root>}
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
              tone="error"
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
            <section>
              <CategoriesScreen
                api={api}
                readOnly={!approver}
                why={
                  roles && !approver
                    ? "Only approvers can add, change, move or delete categories."
                    : undefined
                }
              />
            </section>
          )}
          {!location && onCollections && (
            <section>
              {collectionKey ? (
                <CollectionScreen
                  key={collectionKey}
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
          {!location && onReviews && (
            <section className="mx-auto w-full max-w-300 px-4 py-10 sm:px-6">
              {reviewing ? (
                <ReviewScreen
                  key={reviewing}
                  api={api}
                  pageId={reviewing}
                  selfApproval={selfApproval}
                />
              ) : (
                <ReviewQueueScreen api={api} />
              )}
            </section>
          )}
          {!location && onHistory && params.pageId && (
            <section className="mx-auto w-full max-w-300 px-4 py-10 sm:px-6">
              <HistoryScreen
                key={params.pageId}
                api={api}
                pageId={params.pageId}
                serviceId={historySearch.service}
              />
            </section>
          )}
          {!location && !onCategories && !onCollections && !onReviews && !onHistory && (
            <section>
              <ServicesList
                api={api}
                search={listSearch ?? {}}
                onSearch={(search) => {
                  setServicesSearch(search);
                  void routerNavigate({ to: "/services", search, replace: true });
                }}
                onCreate={() => openDialog("service")}
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
                <Button variant="accent" disabled={readOnly} onClick={() => openDialog("page")}>
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
                nav={showPages}
              />
            </section>
          ))}
        </main>
      </div>
      {leave.dialog}
      {shown === "service" && (
        <CreateRemoteServiceDialog
          key={opened}
          api={api}
          open={dialog === "service"}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            void navigate({ serviceId: id, documentId: id });
          }}
        />
      )}
      {shown === "page" && remote.data && location && (
        <CreateRemotePageDialog
          key={opened}
          api={api}
          open={dialog === "page"}
          detail={remote.data}
          onClose={() => setDialog(null)}
          onDone={(id) => {
            setDialog(null);
            void navigate({ serviceId: location.serviceId, documentId: id });
          }}
        />
      )}
      {shown === "delete" && deleting && (
        <DeleteRemotePageDialog
          key={opened}
          api={api}
          open={dialog === "delete"}
          page={deleting.page}
          session={deleting.session}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            discardPages([deleting.page.id]);
            void navigate(
              !location || deleting.page.id === location.serviceId
                ? undefined
                : { serviceId: location.serviceId, documentId: location.serviceId },
            );
          }}
        />
      )}
    </div>
  );
}
