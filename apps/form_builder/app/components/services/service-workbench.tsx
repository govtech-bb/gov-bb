import { useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  CheckCircleIcon,
  CircleIcon,
  EyeIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { serviceReadiness } from "@govtech-bb/form-types";
import { Button } from "../ui/button";
import { useFormsList } from "../builder/use-forms-list";
import { Select } from "../ui/select";
import { useServiceIndex } from "./service-state";
import { Badge } from "../ui/badge";
import { Banner } from "../ui/banner";
import { Dialog } from "../ui/dialog";
import { LayerCard } from "../ui/layer-card";
import { AppLink } from "../app-link";
import {
  EMPTY_PAGE,
  appendServicePage,
  applyStartLink,
  parseStartLink,
  startPageContentPath,
} from "../../lib/content";
import { serviceCategory, type ServiceRow } from "./service-model";
import {
  useServiceState,
  type ServiceTab,
  type ServiceState,
} from "./service-state";
import { attachServiceForm } from "../../lib/service-drafts";
import { ServiceSetup } from "./service-setup";
import { ServiceHistory } from "./service-history";
import { ServiceJourney } from "./service-journey";
import { ServicePreview } from "./service-preview";
import type { ContentListState } from "../content/use-content-list";
import { CreatePageDialog } from "./create-page-dialog";
import { ServiceWorkspace } from "./service-workspace";

type Row = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  optional?: boolean;
  cta: string;
  label: string;
  run: () => void;
  extra?: { label: string; run: () => void };
};

const pageKindLabel = (kind: string) =>
  kind === "main"
    ? "Entry page"
    : kind === "start"
      ? "Start page"
      : "Supporting page";

export function ServiceWorkbench({
  service,
  tab,
  setup,
  content,
}: {
  service: ServiceRow;
  tab: ServiceTab;
  setup?: string;
  content: ContentListState;
}) {
  const workspace = useServiceState(service);
  const navigate = useNavigate();
  const [addPage, setAddPage] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const draft = workspace.draft;
  const go = (next: ServiceTab, step?: string) =>
    navigate({
      to: "/services",
      search: {
        service: draft?.manifest.serviceId ?? service.key,
        tab: next,
        setup: step,
      },
    });
  if (!draft)
    return workspace.error ? (
      <>
        <Banner variant="alert" className="mb-6">
          <div>
            <p className="font-medium">Service draft unavailable</p>
            <p className="mt-1 text-sm">{workspace.error}</p>
            <Button
              className="mt-3"
              size="sm"
              onClick={() => void workspace.refresh()}
            >
              Try again
            </Button>
          </div>
        </Banner>
        <ServiceWorkspace service={service} content={content} />
      </>
    ) : (
      <p role="status" className="mb-6 text-sm text-ui-subtle">
        Preparing your service workspace…
      </p>
    );
  const { manifest } = draft;
  if (tab === "form" && manifest.formId) {
    return (
      <Navigate
        to="/builder"
        search={{ formId: manifest.formId, service: manifest.serviceId }}
        replace
      />
    );
  }
  const readiness = serviceReadiness(draft);
  const issueFor = (id: string) =>
    readiness.issues.find((i) => i.id === id)?.message;
  const pageIssue = (pageId: string) =>
    readiness.issues.find((i) =>
      [pageId, `${pageId}-form`, `${pageId}-redirect`].includes(i.id),
    )?.message;
  const deliveryIssue = readiness.issues.find(
    (i) => i.section === "delivery" && i.id !== "confirmation",
  )?.message;
  const drafts = new Map(draft.pages.map((p) => [p.id, p]));
  const entry = manifest.pages.find((p) => p.kind === "main");
  const start = manifest.pages.find((p) => p.kind === "start");
  const supporting = manifest.pages.filter((p) => p.kind === "guidance");
  const root = service.contentRoot || manifest.serviceId;
  const edit = (path: string) =>
    navigate({
      to: "/content/edit",
      search: { path, service: manifest.serviceId },
    });
  const builder = () =>
    navigate({
      to: "/builder",
      search: manifest.formId
        ? { formId: manifest.formId, service: manifest.serviceId }
        : {
            newFormId: manifest.serviceId,
            title: manifest.title,
            service: manifest.serviceId,
          },
    });
  const pageRow = (
    page: (typeof manifest.pages)[number],
    title: string,
    cta: string,
  ): Row => ({
    id: page.id,
    title,
    detail: drafts.get(page.id)?.body.trim()
      ? (pageIssue(page.id) ?? "Written")
      : "No content yet",
    done: !pageIssue(page.id),
    cta,
    label: "Edit",
    run: () => void edit(page.path),
  });
  const addStartPage = async () => {
    const slug = `${root}/start`;
    const path = startPageContentPath(slug);
    try {
      let next = appendServicePage(draft, path, {
        ...EMPTY_PAGE,
        title: manifest.title,
        slug,
        category: manifest.category,
        subcategory: manifest.subcategory,
        formId: manifest.formId ?? "",
        linkType: manifest.formId ? "form" : "none",
      });
      const startPath =
        next.manifest.pages.find((p) => p.path === path)?.publicPath ?? "";
      // Content standard: no Start now button on the entry page when a start
      // page follows, so the entry page's button points at the start page.
      if (entry)
        next = {
          ...next,
          pages: next.pages.map((p) =>
            p.id === entry.id
              ? {
                  ...p,
                  body: applyStartLink(p.body, {
                    href: startPath,
                    label: parseStartLink(p.body)?.label || "Start now",
                    hasTarget: true,
                  }),
                }
              : p,
          ),
        };
      if (await workspace.save(next)) await edit(path);
    } catch (e) {
      workspace.setError(
        e instanceof Error ? e.message : "Could not add the start page",
      );
    }
  };
  const unfinishedSupporting = supporting.find((p) => pageIssue(p.id));
  const journey: Row[] = [
    entry
      ? pageRow(entry, "Entry page", "write the entry page")
      : {
          id: "entry",
          title: "Entry page",
          detail: "Required. Explains the service and how to use it.",
          done: false,
          cta: "add the entry page",
          label: "Add",
          run: () => setAddPage(true),
        },
    start
      ? pageRow(start, "Start page", "write the start page")
      : {
          id: "start",
          title: "Start page",
          detail:
            "Optional. Add one when people must prepare documents before they begin.",
          done: false,
          optional: true,
          cta: "",
          label: "Add",
          run: () => void addStartPage(),
        },
    {
      id: "supporting",
      title: "Supporting pages",
      detail: supporting.length
        ? supporting.map((p) => p.title).join(" · ")
        : "Optional. Split out detail that does not fit the entry page.",
      done: supporting.length > 0 && !unfinishedSupporting,
      optional: !supporting.length,
      cta: "finish the supporting pages",
      label: unfinishedSupporting ? "Edit" : "Add",
      run: unfinishedSupporting
        ? () => void edit(unfinishedSupporting.path)
        : () => setAddPage(true),
    },
    manifest.formId
      ? {
          id: "form",
          title: "Application form",
          detail:
            issueFor("missing-form") ??
            issueFor("questions") ??
            (draft.recipe?.title || manifest.formId),
          done: !issueFor("missing-form") && !issueFor("questions"),
          cta: "add the application questions",
          label: "Edit",
          run: () => void builder(),
        }
      : {
          id: "form",
          title: "Application form",
          detail:
            "Optional. Add one when people send information to the department.",
          done: false,
          optional: true,
          cta: "",
          label: "Build",
          run: () => void builder(),
          extra: { label: "Connect", run: () => setAttachOpen(true) },
        },
    ...(manifest.formId
      ? ([
          {
            id: "confirmation",
            title: "Confirmation",
            detail:
              issueFor("confirmation") ??
              "Shown after the application is sent.",
            done: !issueFor("confirmation"),
            cta: "add the confirmation page",
            label: "Edit",
            run: () => void builder(),
          },
          {
            id: "delivery",
            title: "After submission",
            detail:
              deliveryIssue ??
              (manifest.setup.delivery === "configured"
                ? `${draft.recipe?.processors?.length ?? 0} delivery actions`
                : "No automatic delivery"),
            done: !deliveryIssue,
            cta: "set up what happens after submission",
            label: deliveryIssue ? "Set up" : "Edit",
            run: () => void go("delivery"),
          },
        ] satisfies Row[])
      : []),
  ];
  const details: Row[] = [
    {
      id: "about",
      title: "Name and category",
      detail:
        issueFor("category") ??
        issueFor("entry") ??
        `${manifest.title} · ${serviceCategory(manifest.category)}`,
      done: !issueFor("category") && !issueFor("entry"),
      cta: issueFor("entry") ? "choose where people start" : "choose a category",
      label: "Edit",
      run: () => void go("details"),
    },
    {
      id: "contact",
      title: "Contact details",
      detail:
        issueFor("contact") ??
        issueFor("contact-email") ??
        manifest.contactDetails?.email ??
        manifest.contactDetails?.telephoneNumber ??
        "",
      done: !issueFor("contact") && !issueFor("contact-email"),
      cta: "add contact details",
      label: "Edit",
      run: () => void go("details"),
    },
    {
      id: "release",
      title: "Release",
      detail:
        manifest.visibility === "public"
          ? "Everyone can use this service"
          : manifest.visibility === "preview"
            ? "People with preview access"
            : "Draft, hidden from the public",
      done: !issueFor("visibility"),
      cta: "choose who can use the service",
      label: manifest.visibility === "draft" ? "Choose" : "Edit",
      run: () => void go("details"),
    },
  ];
  const next = [...journey, ...details].find(
    (row) => !row.done && !row.optional,
  );
  const cta = readiness.ready
    ? { label: "Publish", run: () => void go("publish") }
    : next
      ? { label: `Continue: ${next.cta}`, run: next.run }
      : { label: "Continue: review the details", run: () => void go("details") };
  return (
    <>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b border-ui-hairline pb-6">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-ui-subtle">
            {serviceCategory(manifest.category)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-ui-strong">
            {manifest.title}
          </h1>
          <p role="status" className="mt-2 text-xs text-ui-subtle">
            {workspace.saving
              ? "Saving draft…"
              : `Service draft on this browser · ${new Date(draft.updatedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<EyeIcon />} onClick={() => setPreview(true)}>
            Preview service
          </Button>
          <Button variant="primary" onClick={cta.run}>
            {cta.label}
          </Button>
        </div>
      </header>
      {workspace.error && (
        <Banner variant="error" role="alert" className="mb-5">
          {workspace.error}
        </Banner>
      )}
      {tab === "details" ? (
        <ServiceSetup
          key={`${manifest.serviceId}:details`}
          workspace={workspace}
          section="details"
        />
      ) : tab === "delivery" ? (
        <ServiceSetup
          key={`${manifest.serviceId}:delivery:${setup ?? ""}`}
          workspace={workspace}
          section="delivery"
          showActions={setup === "actions"}
        />
      ) : tab === "publish" ? (
        <ServiceHistory workspace={workspace} />
      ) : tab === "journey" ? (
        <ServiceJourney snapshot={draft} workspace={workspace} />
      ) : tab === "pages" ? (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Pages</h2>
              <p className="mt-2 text-sm text-ui-subtle">
                Public pages that explain the service: the entry page, an
                optional start page and supporting pages.
              </p>
            </div>
            <Button icon={<PlusIcon />} onClick={() => setAddPage(true)}>
              Add page
            </Button>
          </div>
          <ul className="divide-y divide-ui-hairline rounded-lg border border-ui-hairline bg-ui-base">
            {manifest.pages.map((page) => (
              <li
                key={page.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{page.title}</h3>
                    <Badge variant="secondary">{pageKindLabel(page.kind)}</Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-ui-subtle">
                    {page.publicPath}
                  </p>
                </div>
                <AppLink
                  to="/content/edit"
                  search={{ path: page.path, service: manifest.serviceId }}
                >
                  Edit page
                </AppLink>
              </li>
            ))}
          </ul>
          {!manifest.pages.length && (
            <p className="py-8 text-sm text-ui-subtle">
              Add an entry page to introduce the service and help people start.
            </p>
          )}
        </>
      ) : tab === "form" ? (
        <LayerCard className="p-6">
          <h2 className="text-xl font-semibold">Application form</h2>
          <p className="mt-2 text-sm text-ui-subtle">
            Add one application form when people need to send information to the
            department.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AppLink
              variant="primary"
              to="/builder"
              search={{
                newFormId: manifest.serviceId,
                title: manifest.title,
                service: manifest.serviceId,
              }}
            >
              Create application form
            </AppLink>
            <Button onClick={() => setAttachOpen(true)}>
              Connect existing form
            </Button>
          </div>
        </LayerCard>
      ) : (
        <div className="space-y-8">
          <Checklist heading="Journey" rows={journey} numbered />
          <Checklist heading="Service details" rows={details} />
        </div>
      )}
      {attachOpen && (
        <AttachServiceForm
          workspace={workspace}
          onClose={() => setAttachOpen(false)}
        />
      )}
      {addPage && (
        <CreatePageDialog
          service={{
            ...service,
            title: manifest.title,
            category: manifest.category,
            subcategory: manifest.subcategory,
            formId: manifest.formId ?? "",
            contentRoot: root,
            pages: manifest.pages.map((p) => ({
              path: p.path,
              title: p.title,
              category: manifest.category,
              subcategory: manifest.subcategory,
              formId: manifest.formId ?? "",
              visibility: "draft",
              hasFormButton: false,
            })),
          }}
          pages={[
            ...(content.pages ?? []),
            ...manifest.pages.map((p) => ({
              path: p.path,
              title: p.title,
              category: manifest.category,
              subcategory: manifest.subcategory,
              formId: manifest.formId ?? "",
              visibility: "draft",
              hasFormButton: false,
            })),
          ]}
          open
          onOpenChange={setAddPage}
          onCreate={async (path, state) => {
            if (!(await workspace.save(appendServicePage(draft, path, state))))
              throw new Error(
                "The page could not be saved. Check the service error and try again.",
              );
          }}
        />
      )}
      {preview && (
        <ServicePreview snapshot={draft} onClose={() => setPreview(false)} />
      )}
    </>
  );
}

function Checklist({
  heading,
  rows,
  numbered = false,
}: {
  heading: string;
  rows: Row[];
  numbered?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{heading}</h2>
      <LayerCard>
        <ol aria-label={heading} className="divide-y divide-ui-hairline">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start gap-4 p-5"
            >
              {row.done ? (
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ui-success"
                />
              ) : (
                <CircleIcon
                  size={20}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-ui-subtle"
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">
                  {numbered ? `${index + 1}. ${row.title}` : row.title}
                </h3>
                <p className="mt-1 text-sm text-ui-subtle">{row.detail}</p>
                <span className="sr-only">
                  {row.done ? "Done" : row.optional ? "Optional" : "To do"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={row.run}
                  aria-label={`${row.label} ${row.title.toLowerCase()}`}
                >
                  {row.label}
                </Button>
                {row.extra && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={row.extra.run}
                    aria-label={`${row.extra.label} ${row.title.toLowerCase()}`}
                  >
                    {row.extra.label}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </LayerCard>
    </section>
  );
}

function AttachServiceForm({
  workspace,
  onClose,
}: {
  workspace: ServiceState;
  onClose: () => void;
}) {
  const { forms, loadError } = useFormsList();
  const { entries, error: indexError } = useServiceIndex();
  const [formId, setFormId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const owned = new Set(entries.map((e) => e.manifest.formId));
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog>
        <Dialog.Title>Connect an existing form</Dialog.Title>
        <Dialog.Description className="mt-2">
          This service will own the form and its pending delivery settings.
        </Dialog.Description>
        <div className="mt-5 space-y-4">
          <Select
            label="Application form"
            value={formId}
            onValueChange={(v) => setFormId(String(v))}
            items={[
              { value: "", label: "Choose an unconnected form" },
              ...(forms ?? [])
                .filter((f) => !owned.has(f.formId))
                .map((f) => ({ value: f.formId, label: f.title })),
            ]}
          />
          {(error || loadError || indexError) && (
            <Banner variant="error">{error || loadError || indexError}</Banner>
          )}
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || !formId || !!loadError || !!indexError}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const saved = await attachServiceForm({
                    data: {
                      serviceId: workspace.draft!.manifest.serviceId,
                      expectedRevision: workspace.draft!.revision,
                      formId,
                    },
                  });
                  workspace.setDraft(saved);
                  window.dispatchEvent(new Event("service-draft-saved"));
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not connect the form",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Connect form
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
