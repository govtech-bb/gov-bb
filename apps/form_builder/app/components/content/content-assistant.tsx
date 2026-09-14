import { aiContentPatchSchema } from "@govtech-bb/form-builder";
import {
  applyAiPagePatch,
  isValidContentSlug,
  isValidSlug,
  startPageContentPath,
  startPageUrl,
  contentSlug,
  EMPTY_PAGE,
  type FormState,
} from "../../lib/content";
import type { ServiceRow } from "../services/service-model";
import type { ContentPageSummary } from "../../server/content";
import type { AssistantProps } from "../ui/ai/assistant";
import type { PreparedChange, Proposal } from "../ui/ai/review";
import type { AssistantRequest } from "../ui/ai/prompt-bar";
import { WorkspaceAssistant as Assistant } from "../global-assistant";

export function prepareContentPatch(
  state: FormState,
  proposal: Proposal,
  {
    fixedPath,
    documentId,
    service,
    pages,
    onApply,
    onCreatePage,
  }: {
    fixedPath: boolean;
    documentId: string;
    service?: Pick<
      ServiceRow,
      "category" | "subcategory" | "formId" | "contentRoot" | "pages"
    >;
    pages: { path: string }[] | null;
    onApply: (state: FormState) => void | Promise<void>;
    onCreatePage: (path: string, state: FormState) => void | Promise<void>;
  },
): PreparedChange {
  const patch = aiContentPatchSchema.parse(proposal.patch);
  if (patch.slug !== undefined && !isValidContentSlug(patch.slug))
    throw new Error(
      "The proposed URL slug is invalid. Ask the assistant to correct it.",
    );
  if (
    patch.linkHref &&
    patch.linkType !== "none" &&
    !/^(https?:\/\/|\/)[^\s]+$/i.test(patch.linkHref)
  )
    throw new Error(
      "The proposed start link must be an internal path or an HTTP(S) URL.",
    );
  const create = proposal.operation === "create";
  let path: string | undefined;
  if (create) {
    if (!service || pages === null)
      throw new Error(
        "Open the service and refresh its pages before creating a page.",
      );
    if (!patch.slug || !isValidSlug(patch.slug) || patch.slug === "index")
      throw new Error(
        "Choose a new URL name, such as help, for the separate page.",
      );
    path = startPageContentPath(`${service.contentRoot}/${patch.slug}`);
    if (
      path === documentId ||
      [...pages, ...service.pages].some(
        (page) => contentSlug(page.path) === contentSlug(path!),
      )
    )
      throw new Error(
        "A page or draft already uses this URL. Choose another name or open that page from the service.",
      );
    if (!patch.title?.trim() || !patch.body?.trim())
      throw new Error("The new page needs a title and content.");
  } else if (
    fixedPath &&
    patch.slug !== undefined &&
    patch.slug !== state.slug
  ) {
    throw new Error(
      "This proposal changes the current page URL. Ask for a separate page using operation=create, or keep the current URL.",
    );
  }
  const next = create
    ? {
        ...applyAiPagePatch(
          {
            ...EMPTY_PAGE,
            category: service!.category,
            subcategory: service!.subcategory,
            formId: service!.formId,
          },
          patch,
          { fixedPath: false },
        ),
        slug: `${service!.contentRoot}/${patch.slug}`,
        visibility: "draft" as const,
      }
    : applyAiPagePatch(state, patch, { fixedPath });
  const warnings = [];
  if (!next.title.trim()) warnings.push("Add a page title before deploying.");
  if (!next.category) warnings.push("Choose a category before deploying.");
  if (!next.body.trim()) warnings.push("Add page content before deploying.");
  return {
    before: create ? {} : { ...state },
    after: create ? { path, ...next } : { ...next },
    createPage: create,
    appliedMessage: create
      ? "Created a separate draft page. The existing page is retained. Nothing has been published."
      : undefined,
    warnings,
    apply: () => (path ? onCreatePage(path, next) : onApply(next)),
  };
}

export function ContentAssistant({
  user,
  artifact,
  service,
  pages,
  onCreatePage,
  documentId,
  state,
  fixedPath,
  readOnly,
  open,
  onOpenChange,
  onApply,
  request,
  onRequestHandled,
}: {
  request?: AssistantRequest;
  onRequestHandled?: () => void;
  user: string;
  artifact?: AssistantProps["artifact"];
  service?: ServiceRow;
  pages: ContentPageSummary[] | null;
  onCreatePage: (path: string, state: FormState) => void | Promise<void>;
  documentId: string;
  state: FormState;
  fixedPath: boolean;
  readOnly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (state: FormState) => void;
}) {
  return (
    <Assistant
      key={documentId}
      request={request}
      onRequestHandled={onRequestHandled}
      user={user}
      artifact={artifact}
      target={
        service?.serviceId
          ? { serviceId: service.serviceId, pagePath: documentId }
          : undefined
      }
      kind="content"
      documentId={documentId}
      document={{
        ...state,
        currentPagePath: documentId,
        service: service
          ? {
              title: service.title,
              contentRoot: service.contentRoot,
              formId: service.formId,
              pages: service.pages.map((page) => ({
                title: page.title,
                path: page.path,
                url: startPageUrl(
                  page.category,
                  contentSlug(page.path),
                  page.subcategory,
                ),
                visibility: page.visibility,
              })),
            }
          : undefined,
      }}
      revisionSource={state}
      readOnly={readOnly}
      open={open}
      onOpenChange={onOpenChange}
      prepare={async (proposal) => {
        return prepareContentPatch(state, proposal, {
          fixedPath,
          documentId,
          service,
          pages,
          onApply,
          onCreatePage,
        });
      }}
    />
  );
}
