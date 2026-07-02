import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  serviceContractRecipeSchema,
  processorSchema,
  type ServiceContractRecipe,
  type Processor,
  type PublicFormSummary,
} from "@govtech-bb/form-types";
import { api, ApiError } from "./api-client";
import { getPublishedRecipe } from "./github-recipes";
import type { BuilderFormSummary } from "../types/index";
import { requireSession } from "./auth/require-session";
import {
  redactRecipeSecrets,
  restoreRecipeSecrets,
  assertNoRedactedSecrets,
  hasRedactedSecret,
} from "./redact-processor-secrets";

export const listForms = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(async (): Promise<BuilderFormSummary[]> => {
    const [drafts, published, disabled] = await Promise.all([
      api.get<BuilderFormSummary[]>("/builder/forms"),
      api.get<
        Pick<PublicFormSummary, "formId" | "title" | "version" | "visibility">[]
      >("/builder/forms/published"),
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
    // Launch-gate visibility from the authoring published index (#1835), keyed
    // by formId so it survives the draft-wins merge below. Undefined for a
    // draft-only form (absent from the index) and when the proxy fell back to
    // the public-only list (no token → no `visibility` field); the picker
    // badges only non-public values.
    const visibilityByFormId = new Map(
      published.map((p) => [p.formId, p.visibility] as const),
    );

    // Every formId that has a draft row — used to flag orphan overrides below
    // (a disabled form with neither a draft nor a published recipe).
    const draftIds = new Set(drafts.map((d) => d.formId));

    const byFormId = new Map<string, BuilderFormSummary>();
    for (const d of drafts) byFormId.set(d.formId, d);
    for (const p of published) {
      // #1196: a draft row is the current working copy — always prefer it over
      // the published entry. `isPublished` is OR'd back in by the map below.
      if (byFormId.has(p.formId)) continue;
      byFormId.set(p.formId, {
        id: p.formId,
        formId: p.formId,
        title: p.title,
        version: p.version,
        isPublished: true,
      });
    }

    // The /builder/forms/disabled list is authoritative — it returns every
    // override formId regardless of whether a draft or published recipe still
    // exists. Seed a synthetic row for any disabled formId not already present
    // so a form disabled with no draft and no published recipe still reaches the
    // picker as an Enable-only orphan override (#1658); without this it would
    // never enter byFormId at all.
    const disabledIds = new Set(disabled);
    for (const formId of disabledIds) {
      if (byFormId.has(formId)) continue;
      byFormId.set(formId, {
        id: formId,
        formId,
        title: formId,
        version: "",
        isPublished: false,
      });
    }

    // Mark disabled forms, keeping every one so any disabled form can be
    // re-enabled from the UI (#1658). OR published-index membership into
    // `isPublished` so a disabled published form with a newer draft (whose draft
    // entry won the merge with isPublished=false) keeps its Published state.
    // `isOrphanOverride` flags a disabled override with no underlying draft or
    // published recipe — the picker renders it Enable-only and non-openable.
    // `visibility` (#1835) rides through from the published index so the picker
    // can badge a non-public published form (undefined for orphan/draft-only).
    return Array.from(byFormId.values()).map((f) => ({
      ...f,
      isPublished: f.isPublished || publishedIds.has(f.formId),
      publishedVersion: publishedVersionByFormId.get(f.formId),
      visibility: visibilityByFormId.get(f.formId),
      isDisabled: disabledIds.has(f.formId),
      isOrphanOverride:
        disabledIds.has(f.formId) &&
        !draftIds.has(f.formId) &&
        !publishedIds.has(f.formId),
    }));
  });

// Resolve the recipe the builder should load for `formId`, using the same
// precedence as getRecipe (#1196): the DB draft row is the current working copy,
// so prefer it; with no draft row (e.g. just after the post-merge archive), fall
// back to the published canonical flat file. Returns null when neither exists.
// Shared by getRecipe (which redacts secrets before returning) and the save path
// (which restores redacted secrets from this same source) so both resolve the
// secret from one place.
async function resolveStoredRecipe(
  formId: string,
  token: string,
): Promise<ServiceContractRecipe | null> {
  // #1196: the DB scratch row is the current working draft — prefer it. Guard
  // on truthiness (not just a non-404 response) so a falsy body — a 204 or a
  // `200 null` for an empty draft row — falls through to the published copy
  // rather than being returned as the recipe.
  try {
    const draft = await api.get<ServiceContractRecipe>(
      `/builder/forms/${encodeURIComponent(formId)}`,
    );
    if (draft) {
      // #1682: a form's visibility (`meta.visibility`) was written straight into
      // the published flat files (#1676) for the #1517 flagged forms, bypassing
      // the builder save flow — so their pre-existing DB scratch rows carry no
      // `meta`. When the working copy has none, hydrate it from the published
      // recipe so the builder's visibility control reflects the live launch gate
      // instead of defaulting to "public". A draft that *did* set visibility
      // keeps its own value; an unpublished draft (no flat file) stays metaless.
      if (draft.meta === undefined) {
        try {
          const published = serviceContractRecipeSchema.parse(
            await getPublishedRecipe(token, { formId }),
          );
          if (published.meta !== undefined) draft.meta = published.meta;
        } catch {
          // No published flat file yet — leave meta absent (treated as public).
        }
      }
      return draft;
    }
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }

  // No draft row — seed from the published canonical flat file.
  try {
    const recipe = await getPublishedRecipe(token, { formId });
    return serviceContractRecipeSchema.parse(recipe);
  } catch {
    return null;
  }
}

// Re-inject real processor secrets onto a recipe the browser sent back, pulling
// them from the stored recipe getRecipe served them from. No-op unless the
// incoming recipe actually carries a redaction placeholder, so secret-free
// saves make no extra fetch. Fails closed if a placeholder can't be restored.
async function restoreSecretsForSave(
  recipe: unknown,
  formId: string,
  token: string,
): Promise<unknown> {
  if (!hasRedactedSecret(recipe)) return recipe;
  const stored = await resolveStoredRecipe(formId, token);
  const restored = restoreRecipeSecrets(recipe, stored);
  assertNoRedactedSecrets(restored);
  return restored;
}

export const getRecipe = createServerFn({ method: "GET", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ formId: z.string() }))
  .handler(async ({ data, context }): Promise<ServiceContractRecipe> => {
    // #1196 precedence (draft row, else published) lives in resolveStoredRecipe,
    // so getRecipe and the save path resolve from the same source.
    const recipe = await resolveStoredRecipe(
      data.formId,
      context.session.accessToken,
    );
    if (!recipe) throw new Error(`No recipe found for formId: ${data.formId}`);
    // Strip processor secrets before the recipe reaches the browser (#294).
    return redactRecipeSecrets(recipe);
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
    // Re-inject any processor secrets the browser received redacted (#294).
    const formId = (data.recipe as { formId?: string }).formId ?? "";
    const recipe = await restoreSecretsForSave(
      data.recipe,
      formId,
      context.session.accessToken,
    );
    await api.post("/builder/forms", {
      recipe,
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
    // Re-inject any processor secrets the browser received redacted (#294).
    const recipe = await restoreSecretsForSave(
      data.recipe,
      data.formId,
      context.session.accessToken,
    );
    await api.put(`/builder/forms/${encodeURIComponent(data.formId)}`, {
      recipe,
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
    // Re-inject any processor secrets the browser received redacted (#294).
    // The stored recipe still lives under oldFormId at re-key time.
    const recipe = await restoreSecretsForSave(
      data.recipe,
      data.oldFormId,
      context.session.accessToken,
    );
    await api.post(
      `/builder/forms/${encodeURIComponent(data.oldFormId)}/rekey`,
      // Read-only lock (#874): only the current claim holder may re-key.
      { recipe, userLogin: context.session.login },
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
