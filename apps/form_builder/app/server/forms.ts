import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  serviceContractRecipeSchema,
  processorSchema,
  type ServiceContractRecipe,
  type Processor,
} from "@govtech-bb/form-types";
import { api, ApiError } from "./api-client";
import { getPublishedRecipe } from "./github-recipes";
import { compare as compareSemver } from "../lib/version";
import type { FormDefinitionSummary } from "../types/index";
import { requireSession } from "./auth/require-session";

export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<FormDefinitionSummary[]> => {
    const [drafts, published, disabled] = await Promise.all([
      api.get<FormDefinitionSummary[]>("/builder/forms"),
      api.get<{ formId: string; title: string; version: string }[]>(
        "/builder/forms/published",
      ),
      api.get<string[]>("/builder/forms/disabled"),
    ]);

    // `isPublished` means "this formId appears in the published index" — derive
    // it from the raw published response, independently of the merge loop below.
    // The loop `continue`s when a draft outranks the published copy, so it can't
    // be the source of truth for membership.
    const publishedIds = new Set(published.map((p) => p.formId));
    // The exact version each formId is published at — kept separately from the
    // merged `version` (which may be a higher unpublished draft) so the builder
    // can tell whether the *loaded* version is the published one.
    const publishedVersionByFormId = new Map(
      published.map((p) => [p.formId, p.version] as const),
    );

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

    // Mark disabled forms. A disabled published form is kept so it can be
    // re-enabled from the UI; a disabled non-published entry is an orphan
    // tombstone from the old draft-delete behaviour with no UI home, so it's
    // dropped. OR published-index membership into `isPublished` so a disabled
    // published form with a newer draft (whose draft entry won the merge with
    // isPublished=false) stays put with its Disabled badge and Enable button.
    const disabledIds = new Set(disabled);
    return Array.from(byFormId.values())
      .map((f) => ({
        ...f,
        isPublished: f.isPublished || publishedIds.has(f.formId),
        publishedVersion: publishedVersionByFormId.get(f.formId),
        isDisabled: disabledIds.has(f.formId),
      }))
      .filter((f) => !f.isDisabled || f.isPublished);
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

// `mdaContactId` (issue #607) is a DB-only sibling of the recipe: the API
// upserts it into `form_config`. `null` clears any selection; omitting it
// leaves the stored value untouched. It is intentionally NOT inside the recipe.
const mdaContactIdSchema = z.string().nullable().optional();

// `processors` (issue #716) is a DB-only sibling too: the API merges it into
// `form_config.config.processors`. Carries payment (and any future DB-owned)
// processors that must never enter the committed recipe. `null` clears the key;
// an array sets it; omitting it leaves the stored value untouched.
const processorsSiblingSchema = z.array(processorSchema).nullable().optional();

export const submitRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  // `isNew` flags a brand-new form so the API enforces formId uniqueness; a new
  // version of an existing form omits it (defaults false).
  .inputValidator(
    z.object({
      recipe: z.unknown(),
      isNew: z.boolean().optional(),
      mdaContactId: mdaContactIdSchema,
      processors: processorsSiblingSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await api.post("/builder/forms", {
      recipe: data.recipe,
      isNew: data.isNew ?? false,
      // Read-only lock (#874): the API rejects the save unless this login holds
      // the fresh editing claim. Stamped from the SSR session — the API has no
      // user concept of its own.
      userLogin: context.session.login,
      // Only send the key when the caller supplied one, so a save that never
      // touched the contact selection doesn't clobber a stored value with null.
      ...(data.mdaContactId !== undefined
        ? { mdaContactId: data.mdaContactId }
        : {}),
      ...(data.processors !== undefined ? { processors: data.processors } : {}),
    });
  });

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string(),
      recipe: z.unknown(),
      mdaContactId: mdaContactIdSchema,
      processors: processorsSiblingSchema,
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await api.put(`/builder/forms/${encodeURIComponent(data.formId)}`, {
      recipe: data.recipe,
      // Read-only lock (#874): only the fresh claim holder may save.
      userLogin: context.session.login,
      ...(data.mdaContactId !== undefined
        ? { mdaContactId: data.mdaContactId }
        : {}),
      ...(data.processors !== undefined ? { processors: data.processors } : {}),
    });
  });

// Read the DB-only per-environment config for a form (issue #607, #716).
// Returns the selected MDA contact id (or null) and the DB-resident payment
// processors (or null). Distinct from getRecipe, which returns the recipe
// content — this is the form_config sidecar the recipe never carries.
export const getFormConfig = createServerFn({ method: "GET", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{
      mdaContactId: string | null;
      processors: Processor[] | null;
    }> => {
      return api.get<{
        mdaContactId: string | null;
        processors: Processor[] | null;
      }>(`/builder/forms/${encodeURIComponent(data.formId)}/config`);
    },
  );

// Re-key a draft form: change its Form ID. The API moves every
// form_definitions row from `oldFormId` to `recipe.formId` and writes the saved
// version's content, atomically (issue #674). Distinct from updateRecipe (which
// keeps the ID) and submitRecipe (which creates a brand-new form) — a re-key is
// an identity change of an existing form, so the API can exclude the form's own
// prior record from the title check instead of flagging a false self-collision.
export const rekeyRecipe = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      oldFormId: z.string().min(1),
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await api.post(
      `/builder/forms/${encodeURIComponent(data.oldFormId)}/rekey`,
      // Read-only lock (#874): only the current claim holder may re-key.
      { recipe: data.recipe, userLogin: context.session.login },
    );
  });

// Draft-delete a form: the API removes every form_definitions row for the
// formId. No tombstone is written, so the formId is freed for reuse and a
// public fetch simply 404s. Disabling (not deleting) is the way to retire a
// published form while keeping the formId reserved.
export const deleteForm = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    await api.del(`/builder/forms/${encodeURIComponent(data.formId)}`);
  });

// Disable a form: the API marks the formId as disabled (public fetch -> 410)
// without removing any rows, so it can later be re-enabled. `disabledBy` is the
// GitHub login from the session — form_builder_api only sees the shared admin
// token.
export const disableForm = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }),
  )
  .handler(async ({ data, context }): Promise<void> => {
    await api.post(
      `/builder/forms/${encodeURIComponent(data.formId)}/disable`,
      { reason: data.reason, disabledBy: context.session.login },
    );
  });

// Re-enable a previously disabled form by clearing its disabled marker.
export const enableForm = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    await api.del(`/builder/forms/${encodeURIComponent(data.formId)}/disabled`);
  });

// Delete a single version row of a form. Unlike deleteForm, this leaves no
// tombstone and only removes the one matching row — for pruning a superseded
// draft. The API returns 404 if no such row and 400 if it's published.
export const deleteFormVersion = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .inputValidator(
    z.object({
      formId: z.string().min(1),
      version: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    await api.del(
      `/builder/forms/${encodeURIComponent(data.formId)}/versions/${encodeURIComponent(data.version)}`,
    );
  });
