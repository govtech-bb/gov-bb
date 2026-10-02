import {
  deserializeRecipe,
  mergeDbProcessors,
  type RecipeDraft,
  type RegistryCatalog,
} from "@govtech-bb/form-builder";
import type { ServiceDraft } from "@govtech-bb/form-types";
import { getServiceDraft, getServiceOwner } from "../../lib/service-drafts";
import { getRecipe, getFormConfig } from "../../server/forms";

export async function loadFormDraft(
  formId: string,
  catalog: RegistryCatalog,
): Promise<RecipeDraft> {
  return (await loadFormWorkspace(formId, catalog)).draft;
}

export async function loadFormWorkspace(
  formId: string,
  catalog: RegistryCatalog,
  serviceId?: string,
): Promise<{ draft: RecipeDraft; serviceDraft: ServiceDraft | null }> {
  const owner = await getServiceOwner({ data: { formId } });
  const id = owner.serviceId ?? serviceId;
  const serviceDraft = id
    ? await getServiceDraft({ data: { serviceId: id } })
    : null;
  if (serviceDraft?.manifest.formId && serviceDraft.manifest.formId !== formId)
    throw new Error("This form belongs to a different service");
  const [recipe, config] = serviceDraft?.recipe
    ? [serviceDraft.recipe, serviceDraft.pendingConfig]
    : await Promise.all([
        getRecipe({ data: { formId } }),
        // Older APIs can lack the config sidecar; keep the recipe editable.
        getFormConfig({ data: { formId } }).catch(() => ({
          mdaContactId: null,
          processors: null,
        })),
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
    draft: {
      ...draft,
      mdaContactId: config.mdaContactId,
      processors: mergeDbProcessors(draft.processors, config.processors),
    },
  };
}
