import {
  useServiceIndex,
  mergeServiceRows,
} from "../../components/services/service-state";
import { useGlobalAssistant } from "../../components/global-assistant";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Loader } from "../../components/ui/loader";
import { Banner } from "../../components/ui/banner";
import { Select } from "../../components/ui/select";
import { servicePageLabel } from "../../components/services/service-model";
import { PlusIcon } from "@phosphor-icons/react";
import { CreatePageDialog } from "../../components/services/create-page-dialog";
import { useConfirmation } from "../../components/ui/dialog/confirmation";
import { Button } from "../../components/ui/button";
import type { AssistantRequest } from "../../components/ui/ai/prompt-bar";
import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Delete02Icon } from "hugeicons-react";
import { listForms } from "../../server/forms";
import { getPublishBaseBranch } from "../../server/publish";
import { publishStartPage, deleteContentPage } from "../../server/content";
import { HeaderMenu, type HeaderMenuItem } from "../../components/content/header-menu";
import { linkableForms, buildDeployPayload } from "../../lib/content";
import { useContentList } from "../../components/content/use-content-list";
import { Tabs } from "../../components/ui/tabs";
import { buildServiceRows } from "../../components/services/service-model";
import { createPageDraft } from "../../components/content/draft-store";
import { AppShell } from "../../components/app-shell";
import {
  useEditorState,
  type EditSearch,
} from "../../components/content/use-editor-state";
import { PageFields } from "../../components/content/fields";
import { ContentAssistant } from "../../components/content/content-assistant";
import { DeleteModal, DeployModal } from "../../components/content/modals";
import { SuccessCard } from "../../components/content/success-card";
import type { BuilderFormSummary } from "../../types/index";

export const Route = createFileRoute("/content/edit")({
  validateSearch: (search): EditSearch => ({
    service: typeof search.service === "string" ? search.service : undefined,
    path: typeof search.path === "string" ? search.path : undefined,
    createPath: typeof search.createPath === "string" ? search.createPath : undefined,
    formId: typeof search.formId === "string" ? search.formId : undefined,
    kind: search.kind === "entry" || search.kind === "start" ? search.kind : undefined,
  }),
  loader: async () => {
    const [forms, baseBranch] = await Promise.all([
      // Hide disabled draft-only / orphan-override rows the picker uses for
      // re-enable (#1658) — they have no live recipe to link content to.
      listForms()
        .then(linkableForms)
        .catch(() => []),
      getPublishBaseBranch().catch(() => "dev"),
    ]);
    return { forms, baseBranch };
  },
  component: ContentEditorRoute,
});

// The doc-header overflow menu's entries, gated by editor mode. Kept out of the
// component so its conditional assembly doesn't inflate StartPagesEditor.
function buildHeaderMenuItems(deps: {
  success: boolean;
  editing: boolean;
  deleteAllowed: boolean;
  dirty: boolean;
  onDiscardDraft: () => void;
  onDeletePage: () => void;
  confirm: ReturnType<typeof useConfirmation>;
}): HeaderMenuItem[] {
  const {
    success,
    editing,
    deleteAllowed,
    dirty,
    onDiscardDraft,
    onDeletePage,
    confirm,
  } = deps;
  return [
    ...(dirty && !success
      ? [
          {
            label: "Discard unsaved changes",
            danger: true,
            onSelect: async () => {
              if (
                await confirm({
                  title: "Discard unsaved changes?",
                  description:
                    "Discard your unsaved changes and revert to the saved version?",
                  confirmLabel: "Discard changes",
                  destructive: true,
                })
              )
                onDiscardDraft();
            },
          },
        ]
      : []),
    ...(editing && deleteAllowed && !success
      ? [
          {
            label: "Delete page",
            icon: <Delete02Icon size={15} />,
            danger: true,
            onSelect: onDeletePage,
          },
        ]
      : []),
  ];
}

function ContentEditorRoute() {
  const search = Route.useSearch();
  return (
    <StartPagesEditor
      key={search.path ?? search.createPath ?? `${search.formId}:${search.kind}`}
    />
  );
}

function StartPagesEditor() {
  const confirm = useConfirmation();
  const { user } = Route.useRouteContext();
  const { forms, baseBranch } = Route.useLoaderData();
  const search = Route.useSearch();
  const backLink = search.service
    ? { to: "/services" as const, search: { service: search.service } }
    : { to: "/services" as const, search: {} };
  const navigate = useNavigate();

  const contentList = useContentList(true);
  const serviceIndex = useServiceIndex();
  const service = useMemo(() => {
    const rows = mergeServiceRows(
      buildServiceRows(forms, contentList.pages ?? []),
      serviceIndex.entries,
    );
    return (
      rows.find((row) => row.key === search.service) ??
      rows.find((row) =>
        row.pages.some(
          (page) =>
            page.path === (search.path ?? search.createPath) ||
            `page:${page.path}` === search.service,
        ),
      )
    );
  }, [
    forms,
    contentList.pages,
    serviceIndex.entries,
    search.service,
    search.path,
    search.createPath,
  ]);
  const ed = useEditorState(
    forms,
    search,
    contentList.pages,
    contentList.reviewSnapshot.complete,
    service?.formId,
  );
  const { state } = ed;
  useBlocker({
    enableBeforeUnload: false,
    shouldBlockFn: async ({ current, next }) =>
      (current.routeId !== next.routeId ||
        JSON.stringify(current.search) !== JSON.stringify(next.search)) &&
      !ed.success &&
      !(await ed.confirmDiscard()),
  });
  const editClaims = ed.editPath ? (contentList.openPRs.get(ed.editPath) ?? []) : [];
  const editRevision = ed.editRevision;
  const activeReview =
    editRevision?.source === "pr" && editClaims.length === 1
      ? editClaims.find(
          (claim) => claim.prNumber === editRevision.prNumber && claim.writable,
        )
      : undefined;

  // Combobox options = the builder's forms ∪ any form referenced by a content
  // page, so the picker is populated even when the forms API is unavailable
  // (e.g. local dev, where the content list reads the local checkout).
  const formOptions = useMemo<BuilderFormSummary[]>(() => {
    const map = new Map<string, BuilderFormSummary>();
    for (const f of forms) map.set(f.formId, f);
    for (const p of contentList.pages ?? []) {
      if (p.formId && !map.has(p.formId)) {
        map.set(p.formId, {
          id: p.formId,
          formId: p.formId,
          title: "",
          version: "",
          isPublished: false,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      (a.title || a.formId).localeCompare(b.title || b.formId),
    );
  }, [forms, contentList.pages]);

  const [editorView, setEditorView] = useState<"content" | "settings">(
    "content",
  );
  const [createOpen, setCreateOpen] = useState(false);

  const [deployOpen, setDeployOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Generate with AI: the model proposes page fields, which are applied to
  // the local draft only — deploying stays a separate, human action.
  const { open: aiOpen, setOpen: setAiOpen } = useGlobalAssistant();
  const [aiRequest, setAiRequest] = useState<AssistantRequest>();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onDeploy = async (prDescription: string) => {
    if (ed.serviceDraft) {
      await navigate({
        to: "/services",
        search: { service: ed.serviceDraft.manifest.serviceId, tab: "publish" },
      });
      return;
    }
    setIsPublishing(true);
    ed.setError(null);
    ed.setSuccess(null);
    try {
      const result = await publishStartPage({
        data: buildDeployPayload({
          state,
          slug: ed.slug,
          prDescription,
          creatingCategory: ed.creatingCategory,
          newCatSlug: ed.newCatSlug,
          newCatTitle: ed.newCatTitle,
          newCatDesc: ed.newCatDesc,
          editPath: ed.editPath,
          editSha: ed.editSha,
          editRevision: ed.editRevision,
          baseFrontmatter: ed.baseFrontmatter,
          createPath: ed.createPath,
        }),
      });
      if (result.status === "conflict") {
        ed.setDeployConflict(result.conflict);
        ed.setError(result.conflict.message);
        return;
      }
      setDeployOpen(false);
      ed.markSaved();
      ed.setSuccess({ ...result, kind: ed.editing ? "updated" : "added" });
    } catch (e) {
      ed.setError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setIsPublishing(false);
    }
  };

  const onDelete = async () => {
    if (!ed.editPath) return;
    setIsDeleting(true);
    ed.setError(null);
    try {
      const result = await deleteContentPage({
        data: {
          path: ed.editPath,
          title: state.title.trim(),
          expectedRevision: ed.editRevision ?? { source: "absent" },
        },
      });
      setDeleteOpen(false);
      ed.setSuccess({ ...result, kind: "removed" });
    } catch (e) {
      ed.setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const success = ed.success;
  const visibleError =
    ed.deployConflict?.kind === "review-unavailable" || ed.staleDraft ? null : ed.error;

  return (
    <AppShell
      section="content"
      user={user.login}
      title={
        ed.fixedPath
          ? servicePageLabel({
              path: ed.fixedPath,
              title: state.title.trim() || "Untitled page",
            })
          : state.title.trim() || "Untitled page"
      }
      service={service}
      assistantOpen={aiOpen}
      onToggleAssistant={() => setAiOpen((open) => !open)}
      assistantDisabled={ed.loadingPage || !!success}
      assistant={
        <ContentAssistant
          request={aiRequest}
          onRequestHandled={() => setAiRequest(undefined)}
          user={user.login}
          documentId={ed.fixedPath ?? "new"}
          state={state}
          service={service}
          pages={
            ed.serviceDraft
              ? (service?.pages ?? [])
              : contentList.reviewSnapshot.complete
                ? contentList.pages
                : null
          }
          onCreatePage={async (path, next) => {
            if (ed.serviceDraft) {
              const saved = await ed.createSharedPage(path, next);
              await navigate({
                to: "/content/edit",
                search: { path, service: saved.manifest.serviceId },
                ignoreBlocker: true,
              });
              return;
            }
            if (!ed.persistDraft())
              throw new Error(
                "Your current draft could not be saved. Free some browser storage before creating a page.",
              );
            createPageDraft(path, next);
            void navigate({
              to: "/content/edit",
              search: {
                createPath: path,
                service: service?.key ?? search.service,
              },
              ignoreBlocker: true,
            }).catch((error) =>
              ed.setError(
                error instanceof Error
                  ? error.message
                  : "The new draft was saved, but could not be opened. Find it in the service library.",
              ),
            );
          }}
          fixedPath={!!ed.fixedPath}
          readOnly={
            ed.loadingPage ||
            !ed.sourceReady ||
            !!ed.reviewBlock ||
            ed.staleDraft ||
            !!ed.deployConflict
          }
          open={aiOpen}
          onOpenChange={setAiOpen}
          onApply={ed.setState}
        />
      }
    >
      <div className="@container box-border flex h-full flex-col overflow-hidden bg-ui-canvas font-sans text-[14px] tracking-[-0.15px] text-ui-default min-w-0 flex-1">
        <header className="z-10 shrink-0 border-b border-ui-hairline bg-ui-base">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-ui-strong">
                {state.title.trim() || "Untitled page"}
              </h1>
              <p role="status" className="mt-0.5 text-xs text-ui-subtle">
                Content page ·{" "}
                {ed.dirty && !success
                  ? ed.draftSaved
                    ? "Draft saved on this device"
                    : "Saving draft…"
                  : "No unsaved changes"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {ed.serviceDraft && (
                <>
                  <Button
                    variant="primary"
                    disabled={
                      !ed.dirty || ed.staleDraft || ed.savingShared || ed.loadingPage
                    }
                    onClick={() => void ed.saveShared()}
                  >
                    {ed.savingShared ? "Saving…" : "Save draft"}
                  </Button>
                </>
              )}
              {!success && (
                <Button
                  variant="primary"
                  onClick={() =>
                    ed.serviceDraft
                      ? void navigate({
                          to: "/services",
                          search: {
                            service: ed.serviceDraft.manifest.serviceId,
                            tab: "publish",
                          },
                        })
                      : setDeployOpen(true)
                  }
                  disabled={
                    ed.serviceDraft
                      ? ed.dirty || ed.loadingPage
                      : !ed.canDeploy || isPublishing || ed.loadingPage
                  }
                  title={ed.deployBlockReason ?? undefined}
                >
                  {ed.serviceDraft
                    ? "View history"
                    : activeReview
                      ? "Update review"
                      : "Publish"}
                </Button>
              )}
              <HeaderMenu
                items={buildHeaderMenuItems({
                  confirm,
                  success: !!success,
                  editing: ed.editing,
                  deleteAllowed:
                    !ed.serviceDraft &&
                    ed.editRevision?.source === "base" &&
                    !ed.reviewBlock,
                  dirty: ed.dirty,
                  onDiscardDraft: ed.discardDraft,
                  onDeletePage: () => setDeleteOpen(true),
                })}
              />
            </div>
          </div>
          {!success && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-ui-hairline px-4 pt-3 sm:px-6">
              <Tabs
                aria-label="Page editor"
                variant="underline"
                value={editorView}
                onValueChange={(value) => setEditorView(value as typeof editorView)}
                tabs={[
                  { value: "content", label: "Write" },
                  { value: "settings", label: "Settings" },
                ]}
              />
              {service && (
                <div className="mb-2 flex min-w-0 items-center gap-1">
                  <Select
                    aria-label="Service page"
                    value={ed.fixedPath ?? ""}
                    className="max-w-64"
                    size="sm"
                    items={service.pages.map((page) => ({
                      value: page.path,
                      label: servicePageLabel(page),
                    }))}
                    onValueChange={(path) => {
                      const page = service.pages.find((item) => item.path === path);
                      if (page)
                        void navigate({
                          to: "/content/edit",
                          search: {
                            ...(page.isLocalDraft
                              ? { createPath: page.path }
                              : { path: page.path }),
                            service: service.key,
                          },
                        });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    aria-label="Add content page"
                    disabled={
                      !contentList.pages ||
                      !!contentList.loadError ||
                      !contentList.reviewSnapshot.complete
                    }
                    onClick={() => setCreateOpen(true)}
                    icon={<PlusIcon aria-hidden="true" />}
                  />
                </div>
              )}
            </div>
          )}
          {!success && !ed.loadingPage && ed.deployBlockReason && (
            <p className="px-4 py-2 text-xs text-ui-subtle sm:px-6">
              {ed.deployBlockReason}
            </p>
          )}
        </header>

        {success ? (
          <SuccessCard
            success={success}
            baseBranch={baseBranch}
            onBack={() => navigate(backLink)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-stretch">
            <ScrollArea
              aria-label="Page fields"
              viewportClassName="scroll-fade"
              className="min-h-0 min-w-0 flex-1 bg-ui-canvas"
            >
              <div className="mx-auto min-w-0 max-w-5xl px-4 py-6 @min-[48rem]:px-8 @min-[48rem]:py-8">
                {ed.loadingPage && (
                  <p className="py-2 text-[13px] text-ui-subtle [&_a]:text-ui-link">
                    <span role="status" className="inline-flex items-center gap-2">
                      <Loader size={16} aria-hidden />
                      Loading page…
                    </span>
                  </p>
                )}
                {!ed.loadingPage && activeReview && (
                  <p className="py-2 text-[13px] text-ui-subtle [&_a]:text-ui-link">
                    You’re editing the version in PR{" "}
                    <a
                      href={activeReview.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{activeReview.prNumber}
                    </a>
                    {", not the live page. Updating adds one commit to that PR."}
                  </p>
                )}
                {ed.reviewBlock && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>{ed.reviewBlock.message}</span>
                      <span className="flex flex-wrap items-center gap-2.5 [&_a]:font-semibold [&_a]:text-inherit">
                        {ed.reviewBlock.claims.map((claim) => (
                          <a
                            key={`${claim.prNumber}:${claim.path}:${claim.previousPath ?? ""}`}
                            href={claim.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open PR #{claim.prNumber}
                          </a>
                        ))}
                      </span>
                    </div>
                  </Banner>
                )}
                {ed.deployConflict && ed.deployConflict.claims.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2.5 [&_a]:font-semibold [&_a]:text-inherit">
                    {ed.deployConflict.claims.map((claim) => (
                      <a
                        key={`${claim.prNumber}:${claim.path}:${claim.previousPath ?? ""}`}
                        href={claim.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Review PR #{claim.prNumber}
                      </a>
                    ))}
                  </div>
                )}
                {ed.deployConflict?.kind === "review-unavailable" && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>{ed.deployConflict.message}</span>
                      <Button
                        type="button"
                        onClick={() => {
                          ed.setDeployConflict(null);
                          ed.setError(null);
                          contentList.refetch();
                        }}
                        disabled={contentList.loading}
                        variant="secondary"
                        size="sm"
                      >
                        Retry review check
                      </Button>
                    </div>
                  </Banner>
                )}
                {ed.staleDraft && (
                  <Banner variant="error" role="alert">
                    <div className="min-w-0 space-y-2">
                      <span>
                        {ed.deployConflict
                          ? `${ed.deployConflict.message} `
                          : "This draft is based on an older page revision. "}
                        Your changes are still saved in this browser. Copy anything you
                        need, then load the latest version before deploying.
                      </span>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Discard unsaved changes?",
                              description:
                                "Discard this saved draft and load the latest page version?",
                              confirmLabel: "Discard changes",
                              destructive: true,
                            })
                          ) {
                            ed.discardDraft();
                            if (ed.editPath) {
                              // Let React remove the beforeunload guard after the
                              // draft is discarded, then request a clean revision.
                              window.setTimeout(() => window.location.reload(), 0);
                            }
                          }
                        }}
                        variant="secondary"
                        size="sm"
                      >
                        Discard draft and load latest
                      </Button>
                    </div>
                  </Banner>
                )}
                {visibleError && (
                  <Banner variant="error" role="alert">
                    {visibleError}
                  </Banner>
                )}

                <div inert={ed.loadingPage || !ed.sourceReady} aria-busy={ed.loadingPage}>
                  <PageFields
                    ed={ed}
                    serviceFormId={service?.formId ?? state.formId}
                    formOptions={formOptions}
                    view={editorView === "settings" ? "settings" : "content"}
                    onAiAction={
                      ed.loadingPage ||
                      !ed.sourceReady ||
                      ed.reviewBlock ||
                      ed.staleDraft ||
                      ed.deployConflict
                        ? undefined
                        : (request) => {
                            setAiRequest(request);
                            setAiOpen(true);
                          }
                    }
                  />
                </div>
              </div>
            </ScrollArea>
          </div>
        )}

        {service && (
          <CreatePageDialog
            service={service}
            pages={contentList.pages ?? []}
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreate={
              ed.serviceDraft
                ? async (path, next) => {
                    const saved = await ed.createSharedPage(path, next);
                    await navigate({
                      to: "/content/edit",
                      search: { path, service: saved.manifest.serviceId },
                      ignoreBlocker: true,
                    });
                  }
                : undefined
            }
          />
        )}
        <DeleteModal
          open={deleteOpen && ed.editPath !== null}
          onClose={() => setDeleteOpen(false)}
          editPath={ed.editPath ?? ""}
          error={ed.error}
          isDeleting={isDeleting}
          onDelete={() => void onDelete()}
        />
        <DeployModal
          open={deployOpen}
          onClose={() => setDeployOpen(false)}
          ed={ed}
          baseBranch={baseBranch}
          openPR={activeReview}
          isPublishing={isPublishing}
          onDeploy={(desc) => void onDeploy(desc)}
        />
      </div>
    </AppShell>
  );
}
