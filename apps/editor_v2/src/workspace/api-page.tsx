import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi } from "../api/client";
import { pageQuery, taxonomyQuery } from "../api/queries";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { Button } from "../ui/button";
import { PageHistoryDialog } from "./api-history";
import {
  apiPageDocument,
  canonicalBody,
  detailsKey,
  parseDetails,
  parseServerBase,
  restoredDetails,
  roleOf,
  savePage,
  seedApiPage,
  serverBaseKey,
  writeDetails,
  writeServerBase,
  fieldLabel,
  type ServerBase,
} from "./api-pages";
import { openBodyDocument } from "./documents";
import { flushDocument } from "./model";
import { detailsOf, keepPublishedPath, sameDetails, type PageDetails } from "./page-details";
import { ApiPageDetails } from "./page-details-panel";

const storedListeners = new Set<() => void>();

/** Tell this tab's readers that a stored copy changed; other tabs hear the storage event. */
export function notifyServerBase() {
  for (const listener of storedListeners) listener();
}

function subscribeStored(listener: () => void) {
  storedListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    storedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const useStoredItem = (key: string) =>
  useSyncExternalStore(subscribeStored, () => window.localStorage.getItem(key));

/** The server copy of a page this browser holds, current across tabs. */
export function useServerBase(id: string) {
  const source = useStoredItem(serverBaseKey(id));

  return useMemo(() => parseServerBase(source, id), [source, id]);
}

/** A page from the content API, placed in its browser draft before the editor opens it. */
export function ApiPagePane({ api, id, active }: { api: EditorApi; id: string; active: boolean }) {
  const client = useQueryClient();

  // Seeding writes the draft before its store first reads it, once per page per session.
  const opened = useQuery({
    queryKey: ["opened", id],
    queryFn: async () => {
      const [page] = await Promise.all([
        client.fetchQuery(pageQuery(api, id)),
        client.ensureQueryData(taxonomyQuery(api)),
      ]);

      seedApiPage(browserDraftStorage, page);
      notifyServerBase();

      return page;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (opened.isPending)
    return active ? (
      <p role="status" className="p-8 text-muted">
        Loading page…
      </p>
    ) : null;

  if (opened.isError)
    return active ? (
      <section className="p-8">
        <p role="alert" className="mb-4">
          We could not load this page. Check you are still signed in, then try again.
        </p>
        <Button variant="secondary" onClick={() => void opened.refetch()}>
          Try again
        </Button>
      </section>
    ) : null;

  return <ApiPageEditor api={api} page={opened.data} active={active} />;
}

const noticeClass = "page-document-paused flex flex-wrap items-center gap-x-3 gap-y-2";

function ApiPageEditor({ api, page, active }: { api: EditorApi; page: ApiPage; active: boolean }) {
  const [store] = useState(() =>
    openBodyDocument(apiPageDocument({ ...page, role: roleOf(page) }), browserDraftStorage),
  );

  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const base = useServerBase(page.id);
  const categories = useQuery(taxonomyQuery(api)).data ?? [];
  const server = useQuery(pageQuery(api, page.id)).data ?? page;
  const [failure, setFailure] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const storedDetails = useStoredItem(detailsKey(page.id));

  const details = useMemo(
    () => keepPublishedPath(parseDetails(storedDetails) ?? detailsOf(base?.page ?? page), server),
    [storedDetails, base, page, server],
  );

  const save = useMutation({
    mutationFn: (current: { base: ServerBase; details: PageDetails; body: string }) =>
      savePage(api, current.base, current.details, current.body),
    onSuccess: (outcome) => {
      if (outcome.kind === "saved") {
        rebase(outcome.base);
        client.setQueryData(pageQuery(api, page.id).queryKey, outcome.base.page);
        void client.invalidateQueries({ queryKey: ["content"] });
      } else if (outcome.kind === "conflict")
        void client.invalidateQueries({ queryKey: pageQuery(api, page.id).queryKey });
    },
  });

  useBlocker({
    disabled: !active,
    enableBeforeUnload: () => {
      try {
        flushDocument(store);

        return false;
      } catch {
        return true;
      }
    },
    shouldBlockFn: () => {
      try {
        flushDocument(store);
        setFailure("");

        return false;
      } catch (error) {
        setFailure(
          error instanceof Error ? error.message : "Save or download this draft before leaving it.",
        );

        return true;
      }
    },
  });

  const outcome = save.isPending ? undefined : save.data;

  const unsaved =
    !!base && (draft.committed !== base.body || !sameDetails(details, detailsOf(base.page)));

  const stale = !!base && server.updated_at !== base.page.updated_at;

  // The body alone would lose unsaved details, so the copy is the whole page as a save sends it.
  const downloadMine = () =>
    download(JSON.stringify({ ...details, body_markdown: draft.committed }, null, 2), "page.json");

  const blocked =
    !draft.valid ||
    draft.dirty ||
    !!draft.conflict ||
    !!draft.replacement ||
    !!draft.recovery ||
    draft.status === "error";

  const errors = outcome?.kind === "invalid" ? outcome.errors : [];

  const rebase = (next: ServerBase) => {
    writeServerBase(browserDraftStorage, next);
    notifyServerBase();
  };

  const changeDetails = (next: PageDetails) => {
    writeDetails(browserDraftStorage, page.id, next);
    notifyServerBase();
  };

  const saveDraft = () => {
    store.flush();
    const snapshot = store.getSnapshot();

    if (base && snapshot.status !== "error")
      save.mutate({ base, details, body: snapshot.committed });
  };

  const loadSaved = () => {
    const body = canonicalBody(server.body_markdown);
    store.edit(body);

    if (store.apply()) {
      changeDetails(detailsOf(server));
      rebase({ page: server, body });
    }
  };

  const notice = stale ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">A newer version of this page has been saved since you opened it.</p>
      {unsaved && (
        <Button
          variant="secondary"
          onClick={() => rebase({ page: server, body: canonicalBody(server.body_markdown) })}
        >
          Keep my version
        </Button>
      )}
      <Button variant="secondary" disabled={blocked} onClick={loadSaved}>
        Load saved version
      </Button>
      {unsaved && <Button onClick={downloadMine}>Download my version</Button>}
    </div>
  ) : outcome?.kind === "invalid" ? (
    <div role="alert" className="page-document-paused">
      <p className="font-semibold">There is a problem</p>
      <ul className="mt-1 list-disc ps-5">
        {errors.map((error) => (
          <li key={`${error.field}:${error.message}`}>
            {fieldLabel(error.field)}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  ) : outcome?.kind === "signed-out" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">
        Your session has ended. Sign in again to save; your changes are kept in this browser.
      </p>
      <Button
        variant="secondary"
        onClick={() =>
          void navigate({
            to: "/auth",
            search: { state: "sign-in", returnTo: pathname, reason: "provider" },
          })
        }
      >
        Sign in again
      </Button>
    </div>
  ) : outcome?.kind === "missing" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">This page is no longer in the content API.</p>
      <Button onClick={downloadMine}>Download my version</Button>
    </div>
  ) : outcome?.kind === "failed" ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">We could not save this page. Your changes are kept in this browser.</p>
      <Button variant="secondary" onClick={saveDraft}>
        Try again
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      {failure && (
        <div role="alert" className="border-s-4 border-error bg-white px-6 py-3 text-error">
          {failure}
        </div>
      )}
      <PageDraftEditor
        store={store}
        active={active}
        saveStatus={
          save.isPending
            ? "saving"
            : unsaved && outcome && outcome.kind !== "saved"
              ? "failed"
              : unsaved
                ? "unsaved"
                : "saved"
        }
        tools={
          <>
            <Button onClick={() => setHistoryOpen(true)}>History</Button>
            <Button
              variant="accent"
              disabled={
                !unsaved || stale || blocked || save.isPending || outcome?.kind === "missing"
              }
              onClick={saveDraft}
            >
              {details.visibility === "public" ? "Publish changes" : "Save"}
            </Button>
          </>
        }
        notice={notice}
        fields={{
          title: details.title,
          lede: details.frontmatter.lede,
          panel: (
            <ApiPageDetails
              details={details}
              change={changeDetails}
              categories={categories}
              entry={server.parent_id === null}
              publishedAt={server.published_at}
              pathLocked={server.published_at ? "Published pages keep their path." : undefined}
              errors={Object.fromEntries(errors.map((error) => [error.field, error.message]))}
            />
          ),
        }}
      />
      {historyOpen && (
        <PageHistoryDialog
          api={api}
          current={server}
          canRestore={!blocked}
          close={() => setHistoryOpen(false)}
          restore={(version) => {
            store.edit(canonicalBody(version.body_markdown));

            if (store.apply()) changeDetails(restoredDetails(details, version));
            setHistoryOpen(false);
          }}
        />
      )}
    </>
  );
}
