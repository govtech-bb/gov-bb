import {
  aiTargetSchema,
  deserializeRecipe,
  proposeContentTool,
  proposeFormTool,
  readFormTool,
  readPageTool,
  readServiceTool,
  redactAiData,
  serializeRecipeDraft,
  updateServiceDetailsTool,
} from "@govtech-bb/form-builder";
import { serviceManifestSchema } from "@govtech-bb/form-types";
import {
  appendServicePage,
  buildServicePageDraft,
  contentSlug,
  EMPTY_PAGE,
  isKnownCategory,
  pageToFormState,
  subcategoriesFor,
} from "../../../lib/content";
import {
  getServiceDraft,
  listServiceDrafts,
  saveServiceDraft,
  saveServiceForm,
  saveServicePage,
} from "../../../lib/service-drafts";
import { getCatalogFn, validateRecipe } from "../../../server/registry";
import { prepareFormDraft, recipeSnapshot } from "../../builder/form-assistant";
import { prepareContentPatch } from "../../content/content-assistant";
import type { PreparedChange, Proposal } from "./review";

async function loadDraft(serviceId: string) {
  if (
    !(await listServiceDrafts()).some(
      (draft) => draft.manifest.serviceId === serviceId,
    )
  )
    throw new Error(
      "Open this service in the workspace before asking the assistant to read or edit it.",
    );
  return getServiceDraft({ data: { serviceId } });
}

function output(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactAiData(value) as Record<string, unknown>;
  if (JSON.stringify(redacted).length > 200_000)
    throw new Error(
      "This draft is too large for the assistant. Open the document and work on a smaller section.",
    );
  return redacted;
}

export async function readService(input: { serviceId: string }) {
  const { serviceId } = readServiceTool.inputSchema.parse(input);
  const draft = await loadDraft(serviceId);
  return output({
    serviceId,
    revision: draft.revision,
    manifest: draft.manifest,
  });
}

export async function readPage(input: { serviceId: string; pagePath: string }) {
  const { serviceId, pagePath } = readPageTool.inputSchema.parse(input);
  const draft = await loadDraft(serviceId);
  const page = draft.pages.find((page) => page.path === pagePath);
  if (!page)
    throw new Error("This page does not belong to the selected service.");
  return output({ serviceId, revision: draft.revision, page });
}

export async function readForm(input: { serviceId: string }) {
  const { serviceId } = readFormTool.inputSchema.parse(input);
  const draft = await loadDraft(serviceId);
  return output({ serviceId, revision: draft.revision, recipe: draft.recipe });
}

function validateCategory(category: string, subcategory: string) {
  if (category && !isKnownCategory(category))
    throw new Error(
      "Choose a category from the service's existing category list.",
    );
  if (
    subcategory &&
    !subcategoriesFor(category).some((item) => item.slug === subcategory)
  )
    throw new Error("Choose a subcategory belonging to the selected category.");
}

export async function prepareServiceEdit(
  toolName: string,
  proposal: Proposal,
): Promise<PreparedChange> {
  const target = aiTargetSchema.parse(proposal.target);
  const draft = await loadDraft(target.serviceId);
  const { serviceId } = draft.manifest;
  const expectedRevision = draft.revision;
  if (toolName === proposeContentTool.name) {
    const parsed = proposeContentTool.inputSchema.parse(proposal);
    const page = draft.pages.find((page) => page.path === target.pagePath);
    if (!page && parsed.operation !== "create")
      throw new Error(
        "Choose a page belonging to the selected service before editing it.",
      );
    const main =
      draft.manifest.pages.find((page) => page.kind === "main") ??
      draft.manifest.pages[0];
    const service = {
      ...draft.manifest,
      formId: draft.manifest.formId ?? "",
      contentRoot: main
        ? contentSlug(main.path).replace(/\/start$/, "")
        : serviceId,
      pages: draft.manifest.pages.map((page) => ({
        ...page,
        category: draft.manifest.category,
        subcategory: draft.manifest.subcategory,
        formId: draft.manifest.formId ?? "",
        visibility: "draft",
        hasFormButton: false,
      })),
    };
    const current = page
      ? pageToFormState(page, service.formId)
      : {
          ...EMPTY_PAGE,
          category: service.category,
          subcategory: service.subcategory,
        };
    if (
      parsed.patch.category !== undefined ||
      parsed.patch.subcategory !== undefined
    )
      validateCategory(
        parsed.patch.category ?? current.category,
        parsed.patch.subcategory ??
          (parsed.patch.category !== undefined ? "" : current.subcategory),
      );
    const change = prepareContentPatch(current, parsed, {
      fixedPath: !!page,
      documentId: page?.path ?? "",
      service,
      pages: (await listServiceDrafts()).flatMap((draft) => draft.pages),
      onApply: async (state) => {
        await saveServicePage({
          data: {
            serviceId,
            expectedRevision,
            page: buildServicePageDraft(state, page!),
          },
        });
      },
      onCreatePage: async (path, state) => {
        await saveServiceDraft({
          data: {
            expectedRevision,
            snapshot: appendServicePage(draft, path, state),
          },
        });
      },
    });
    return {
      ...change,
      external: true,
      appliedMessage: change.createPage
        ? "Created a page in the service workspace draft. It has not been published."
        : "Saved to the service workspace draft. It has not been published.",
    };
  }
  if (toolName === proposeFormTool.name) {
    const parsed = proposeFormTool.inputSchema.parse(proposal);
    if (!draft.recipe)
      throw new Error(
        "Connect an application form in the service workspace before editing it.",
      );
    const catalog = await getCatalogFn();
    const current = deserializeRecipe(
      {
        ...draft.recipe,
        createdAt: draft.recipe.createdAt ?? draft.updatedAt,
        updatedAt: draft.recipe.updatedAt ?? draft.updatedAt,
      },
      catalog,
    );
    const next = prepareFormDraft(current, parsed.recipe, catalog, true);
    const recipe = serializeRecipeDraft(next);
    const validation = await validateRecipe({ data: { recipe } });
    return {
      before: recipeSnapshot(current),
      after: recipeSnapshot(next),
      warnings: validation.ok
        ? []
        : validation.issues.map(
            (issue) => (issue.path ? `${issue.path}: ` : "") + issue.message,
          ),
      external: true,
      appliedMessage:
        "Saved to the service workspace draft. It has not been published.",
      apply: async () => {
        await saveServiceForm({
          data: {
            serviceId,
            expectedRevision,
            recipe,
            pendingConfig: draft.pendingConfig,
          },
        });
      },
    };
  }
  if (toolName === updateServiceDetailsTool.name) {
    const { patch } = updateServiceDetailsTool.inputSchema.parse(proposal);
    const manifest = serviceManifestSchema.parse({
      ...draft.manifest,
      ...patch,
      subcategory:
        patch.subcategory ??
        (patch.category !== undefined ? "" : draft.manifest.subcategory),
      setup: { ...draft.manifest.setup, ...patch.setup },
    });
    if (patch.category !== undefined || patch.subcategory !== undefined)
      validateCategory(manifest.category, manifest.subcategory);
    return {
      before: { ...draft.manifest },
      after: { ...manifest },
      warnings: [],
      external: true,
      appliedMessage:
        "Saved to the service workspace draft. It has not been published.",
      apply: async () => {
        await saveServiceDraft({
          data: { expectedRevision, snapshot: { ...draft, manifest } },
        });
      },
    };
  }
  throw new Error("This tool cannot edit a service draft.");
}
