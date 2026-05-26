import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  serviceContractRecipeSchema,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { api, ApiError } from "./api-client";
import { listPublishedForms, getPublishedRecipe } from "./github-recipes";
import { compare as compareSemver } from "../lib/version";
import type { FormDefinitionSummary } from "../types/index";
import { requireSession } from "./auth/require-session";

export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async ({ context }): Promise<FormDefinitionSummary[]> => {
    const token = context.session.accessToken;
    const [drafts, published] = await Promise.all([
      api.get<FormDefinitionSummary[]>("/builder/forms"),
      listPublishedForms(token),
    ]);

    const byFormId = new Map<string, FormDefinitionSummary>();
    for (const d of drafts) byFormId.set(d.formId, d);
    for (const p of published) {
      const existing = byFormId.get(p.formId);
      if (existing && compareSemver(existing.version, p.version) > 0) continue;
      byFormId.set(p.formId, {
        id: p.formId,
        formId: p.formId,
        title: p.title,
        version: p.version,
        isPublished: true,
      });
    }
    return Array.from(byFormId.values());
  });

export const getRecipe = createServerFn({ method: "GET", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(async ({ data, context }): Promise<ServiceContractRecipe> => {
    const token = context.session.accessToken;

    let draft: ServiceContractRecipe | null = null;
    try {
      draft = await api.get<ServiceContractRecipe>(
        `/builder/forms/${encodeURIComponent(data.formId)}`,
      );
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
    }

    let published: { version: string; recipe: unknown } | null = null;
    try {
      const recipe = await getPublishedRecipe(token, { formId: data.formId });
      const version =
        typeof (recipe as { version?: unknown }).version === "string"
          ? (recipe as { version: string }).version
          : null;
      if (version) published = { version, recipe };
    } catch {
      // No published copy — fall back to draft (or fail below).
    }

    if (
      draft &&
      (!published || compareSemver(draft.version, published.version) >= 0)
    ) {
      return draft;
    }
    if (published) {
      return serviceContractRecipeSchema.parse(published.recipe);
    }
    throw new Error(`No recipe found for formId: ${data.formId}`);
  });

export const submitRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<void> => {
    await api.post("/builder/forms", { recipe: data.recipe });
  });

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string(),
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    await api.put(`/builder/forms/${encodeURIComponent(data.formId)}`, {
      recipe: data.recipe,
    });
  });

export const nextVersion = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{ currentVersion: string | null; nextVersion: string }> => {
      return api.get<{ currentVersion: string | null; nextVersion: string }>(
        `/builder/forms/${encodeURIComponent(data.formId)}/next-version`,
      );
    },
  );
