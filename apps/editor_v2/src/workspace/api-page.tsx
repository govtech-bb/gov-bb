import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { ApiPage, EditorApi } from "../api/client";
import { pageToMarkdown, pickerCategories } from "../api/page-markdown";
import { pageQuery, taxonomyQuery } from "../api/queries";
import { browserDraftStorage } from "../host/govbb-draft";
import { PageDraftEditor } from "../host/page-editor";
import { download } from "../host/source-ui";
import { readPageMetadata } from "../pages";
import { Button } from "../ui/button";
import {
  apiPageDocument,
  parseServerBase,
  roleOf,
  savePage,
  seedApiPage,
  serverBaseKey,
  writeServerBase,
  type ServerBase,
} from "./api-pages";
import { openDocument } from "./documents";
import { flushDocument } from "./model";

const baseListeners = new Set<() => void>();

/** Tell this tab's readers that a server copy changed; other tabs hear the storage event. */
export function notifyServerBase() {
  for (const listener of baseListeners) listener();
}

function subscribeServerBase(listener: () => void) {
  baseListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    baseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The server copy of a page this browser holds, current across tabs. */
export function useServerBase(id: string) {
  const source = useSyncExternalStore(subscribeServerBase, () =>
    window.localStorage.getItem(serverBaseKey(id)),
  );

  return useMemo(() => parseServerBase(source, id), [source, id]);
}

/** A page from the content API, placed in its browser draft before the editor opens it. */
export function ApiPagePane({ api, id, active }: { api: EditorApi; id: string; active: boolean }) {
  const client = useQueryClient();

  // Seeding writes the draft before its store first reads it, once per page per session.
  const opened = useQuery({
    queryKey: ["opened", id],
    queryFn: async () => {
      const [page, categories] = await Promise.all([
        client.fetchQuery(pageQuery(api, id)),
        client.ensureQueryData(taxonomyQuery(api)),
      ]);

      seedApiPage(browserDraftStorage, page, categories);
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

const FIELD_LABELS = new Map([
  ["title", "Title"],
  ["url", "Path"],
  ["category", "Category"],
  ["category_id", "Category"],
  ["subcategory", "Subcategory"],
  ["description", "Description"],
  ["visibility", "Visibility"],
  ["form_id", "Form ID"],
  ["publish_date", "Publication date"],
  ["lede", "Introduction"],
  ["parent_id", "Parent page"],
]);

const noticeClass = "page-document-paused flex flex-wrap items-center gap-x-3 gap-y-2";

function ApiPageEditor({ api, page, active }: { api: EditorApi; page: ApiPage; active: boolean }) {
  const [store] = useState(() =>
    openDocument(apiPageDocument({ ...page, role: roleOf(page) }), browserDraftStorage),
  );

  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const draft = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const base = useServerBase(page.id);
  const categories = useQuery(taxonomyQuery(api)).data ?? [];
  const server = useQuery(pageQuery(api, page.id)).data ?? page;
  const [failure, setFailure] = useState("");

  const save = useMutation({
    mutationFn: (current: { base: ServerBase; markdown: string }) =>
      savePage(api, current.base, current.markdown, categories),
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

  const visibility = useMemo(
    () => readPageMetadata(draft.committed).visibility || "public",
    [draft.committed],
  );

  const outcome = save.isPending ? undefined : save.data;
  const unsaved = !!base && draft.committed !== base.markdown;
  const stale = !!base && server.updated_at !== base.page.updated_at;

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

  const saveDraft = () => {
    store.flush();
    const snapshot = store.getSnapshot();

    if (base && snapshot.status !== "error") save.mutate({ base, markdown: snapshot.committed });
  };

  const loadSaved = () => {
    const markdown = pageToMarkdown(server, categories);
    store.edit(markdown);

    if (store.apply()) rebase({ page: server, markdown });
  };

  const notice = stale ? (
    <div role="alert" className={noticeClass}>
      <p className="me-auto">A newer version of this page has been saved since you opened it.</p>
      {unsaved && (
        <Button
          variant="secondary"
          onClick={() => rebase({ page: server, markdown: pageToMarkdown(server, categories) })}
        >
          Keep my version
        </Button>
      )}
      <Button variant="secondary" disabled={blocked} onClick={loadSaved}>
        Load saved version
      </Button>
      {unsaved && (
        <Button onClick={() => download(draft.committed, "page.md")}>Download my version</Button>
      )}
    </div>
  ) : outcome?.kind === "invalid" ? (
    <div role="alert" className="page-document-paused">
      <p className="font-semibold">There is a problem</p>
      <ul className="mt-1 list-disc ps-5">
        {errors.map((error) => (
          <li key={`${error.field}:${error.message}`}>
            {FIELD_LABELS.get(error.field) ?? error.field}: {error.message}
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
      <Button onClick={() => download(draft.committed, "page.md")}>Download my version</Button>
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
          <Button
            variant="accent"
            disabled={!unsaved || stale || blocked || save.isPending || outcome?.kind === "missing"}
            onClick={saveDraft}
          >
            {visibility === "public" ? "Publish changes" : "Save"}
          </Button>
        }
        notice={notice}
        details={{
          ...(server.parent_id === null && {
            categories: pickerCategories(categories),
            single: true,
          }),
          publishedAt: server.published_at,
          errors: Object.fromEntries(errors.map((error) => [error.field, error.message])),
        }}
      />
    </>
  );
}
