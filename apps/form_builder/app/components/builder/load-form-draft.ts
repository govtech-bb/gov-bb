import {
  deserializeRecipe,
  mergeDbProcessors,
  type RecipeDraft,
  type RegistryCatalog,
} from "@govtech-bb/form-builder";
import type { ServiceDraft } from "@govtech-bb/form-types";
import { getServiceDraft, getServiceOwner } from "../../lib/service-drafts";
import { getRecipe, getFormConfig } from "../../server/forms";
import { getFormSourceSha } from "../../server/services";

export async function loadFormWorkspace(
  formId: string,
  catalog: RegistryCatalog,
  serviceId?: string,
): Promise<{
  draft: RecipeDraft;
  serviceDraft: ServiceDraft | null;
  /**
   * The committed recipe's blob sha on the base branch when this form was
   * loaded, or null when none was committed (or it could not be read). Deploy
   * sends it back as `expectedSourceSha` so a fix that merged while the form
   * was open cannot be overwritten (#2489). It belongs to the recipe loaded
   * here and is never refreshed on its own.
   */
  sourceSha: string | null;
}> {
  const owner = await getServiceOwner({ data: { formId } });
  const id = owner.serviceId ?? serviceId;
  const serviceDraft = id
    ? await getServiceDraft({ data: { serviceId: id } })
    : null;
  if (serviceDraft?.manifest.formId && serviceDraft.manifest.formId !== formId)
    throw new Error("This form belongs to a different service");
  const [recipe, config, sourceSha] = serviceDraft?.recipe
    ? // A service-owned form deploys through the services workspace, which
      // carries its own baseRecipeSha — the legacy Deploy never runs for it.
      [serviceDraft.recipe, serviceDraft.pendingConfig, null]
    : await Promise.all([
        getRecipe({ data: { formId } }),
        // Older APIs can lack the config sidecar; keep the recipe editable.
        getFormConfig({ data: { formId } }).catch(() => ({
          mdaContactId: null,
          processors: null,
        })),
        // A failed read must not block opening the form, and null is the safe
        // direction: Deploy checks it against the live sha and refuses when a
        // committed copy turns out to exist, so the worst case is one
        // "reload" prompt rather than a silent overwrite.
        getFormSourceSha({ data: { formId } }).catch(() => null),
      ]);
  const draft = deserializeRecipe(
    {
      ...recipe,
      createdAt:
        recipe.createdAt ?? serviceDraft?.updatedAt ?? new Date().toISOString(),
      updatedAt:
        recipe.updatedAt ?? serviceDraft?.updatedAt ?? new Date().toISOString(),
    },
    catalog,
  );
  return {
    serviceDraft,
    sourceSha,
    draft: {
      ...draft,
      mdaContactId: config.mdaContactId,
      processors: mergeDbProcessors(draft.processors, config.processors),
    },
  };
}
