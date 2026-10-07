import { useState } from "react";
import {
  ArrowSquareOutIcon,
  FileTextIcon,
  ListChecksIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { AppLink } from "../app-link";
import { servicePageLabel } from "./service-model";
import { Badge } from "../ui/badge";
import { Button, LinkButton } from "../ui/button";
import { ClipboardText } from "../ui/clipboard-text";
import {
  contentSlug,
  isValidSlug,
  startPageUrl,
  VISIBILITY_WORD,
  type ViewLevel,
} from "../../lib/content";
import type { OpenDeployPR } from "../../server/publish";
import type { ContentListState } from "../content/use-content-list";
import {
  serviceCategory,
  serviceStatus,
  type ServiceRow,
} from "./service-model";
import { CreatePageDialog } from "./create-page-dialog";

export function ServiceWorkspace({
  service,
  content,
  formPR,
  formsAvailable = true,
}: {
  service: ServiceRow;
  content: ContentListState;
  formPR?: OpenDeployPR;
  formsAvailable?: boolean;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const form = service.form;
  const canEditForm = !!form && !form.isOrphanOverride;
  const canCreatePage =
    content.pages !== null &&
    !content.loadError &&
    content.reviewSnapshot.complete;
  const newFormId = service.formId || service.contentRoot.replaceAll("/", "-");
  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight text-balance wrap-anywhere">
            {service.title}
          </h1>
          <p className="mt-1 text-sm text-ui-subtle">
            {serviceCategory(service.category)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={form?.isDisabled ? "error" : "secondary"}>
            {serviceStatus(service)}
          </Badge>
          {form?.hasDraftRow && form.isPublished && (
            <Badge variant="secondary">Working copy</Badge>
          )}
        </div>
      </header>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="service-content-heading" className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileTextIcon
                size={20}
                className="text-ui-subtle"
                aria-hidden="true"
              />
              <h2
                id="service-content-heading"
                className="text-base font-semibold"
              >
                Content pages
              </h2>
            </div>
            <Button
              size="base"
              variant="primary"
              icon={<PlusIcon aria-hidden="true" />}
              disabled={!canCreatePage}
              onClick={() => setCreateOpen(true)}
            >
              Add content page
            </Button>
          </header>
          <p className="mt-2 text-sm text-ui-subtle">
            Your main page and supporting guidance. Each page has its own link.
          </p>
          <ul className="mt-4 overflow-hidden rounded-lg border border-ui-hairline bg-ui-base divide-y divide-ui-hairline">
            {service.pages.map((page) => {
              const claims = content.openPRs.get(page.path) ?? [];
              const editable =
                claims.length === 0 ||
                (claims.length === 1 && claims[0].writable);
              const url = startPageUrl(
                page.category,
                contentSlug(page.path),
                page.subcategory,
              );
              return (
                <li key={page.path} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-ui-strong wrap-anywhere">
                        {servicePageLabel(page)}
                      </h3>
                      <p className="mt-1 text-xs text-ui-subtle">
                        {page.isLocalDraft
                          ? "Draft on this device"
                          : (VISIBILITY_WORD[page.visibility as ViewLevel] ??
                            "Published")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editable && (
                        <AppLink
                          to="/content/edit"
                          search={{
                            ...(page.isLocalDraft
                              ? { createPath: page.path }
                              : { path: page.path }),
                            service: service.key,
                          }}
                          size="sm"
                          aria-label={`Edit ${page.title || "untitled page"}`}
                        >
                          Edit page
                        </AppLink>
                      )}
                      {claims.map((claim) => (
                        <LinkButton
                          key={`${claim.prNumber}:${claim.path}`}
                          href={claim.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                          variant="ghost"
                          aria-label={`Review ${page.title} in pull request ${claim.prNumber}`}
                        >
                          Review #{claim.prNumber}
                        </LinkButton>
                      ))}
                    </div>
                  </div>
                  <ClipboardText
                    className="mt-1 w-full border-0 bg-transparent p-0 font-sans text-ui-subtle ring-0 shadow-none [&>span:first-child]:ps-0 [&>button]:border-0!"
                    text={url}
                    size="sm"
                    labels={{
                      copyAction: `Copy link to ${page.title || "untitled page"}`,
                    }}
                  />
                </li>
              );
            })}
          </ul>
          {service.pages.length === 0 && (
            <p className="mt-4 text-sm text-ui-subtle">
              Add the main service page to get started. It can link straight to
              the form.
            </p>
          )}
          {!canCreatePage && (
            <p className="mt-4 text-sm text-ui-subtle">
              Refresh the content and review status before creating another
              page.
            </p>
          )}
        </section>
        <section
          aria-labelledby="service-form-heading"
          className="min-w-0 rounded-lg border border-ui-hairline bg-ui-base p-5"
        >
          <ListChecksIcon
            size={24}
            className="mb-3 text-ui-subtle"
            aria-hidden="true"
          />
          <h2 id="service-form-heading" className="text-base font-semibold">
            Application form
          </h2>
          <p className="mt-2 text-sm text-ui-subtle">
            {form
              ? "The form people complete for this service."
              : "Add a form when people need to apply online."}
          </p>
          {form && (
            <p className="mt-3 break-all text-xs text-ui-subtle">
              {form.title || form.formId} · Version {form.version}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {canEditForm && (
              <AppLink
                to="/builder"
                search={{ formId: form.formId, service: service.key }}
                variant="primary"
              >
                Edit form
              </AppLink>
            )}
            {form ? (
              <AppLink
                to="/builder"
                search={{
                  ...(canEditForm ? { formId: form.formId } : {}),
                  picker: true,
                  service: service.key,
                }}
              >
                Manage form
              </AppLink>
            ) : (
              formsAvailable &&
              isValidSlug(newFormId) && (
                <AppLink
                  to="/builder"
                  search={{
                    newFormId,
                    title: service.title,
                    service: service.key,
                  }}
                  variant="primary"
                >
                  Create form
                </AppLink>
              )
            )}
            {formPR && (
              <LinkButton
                href={formPR.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="ghost"
                icon={<ArrowSquareOutIcon aria-hidden="true" />}
              >
                Review form changes
              </LinkButton>
            )}
          </div>
        </section>
      </div>
      <CreatePageDialog
        service={service}
        pages={content.pages ?? []}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}
