import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getCatalog,
  getRegistryItem,
  hydrateForm,
  validateFormContract,
  BEHAVIOUR_TYPE_DESCRIPTORS,
  VALIDATION_RULE_DESCRIPTORS,
} from "@govtech-bb/form-builder";
import type {
  RegistryCatalog,
  CustomComponentEntry,
} from "@govtech-bb/form-builder";
import type {
  ServiceContractRecipe,
  ServiceContract,
} from "@govtech-bb/form-types";
import type { ValidationResult } from "@govtech-bb/form-builder";
import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "./db";

export const getCatalogFn = createServerFn({
  method: "GET",
  strict: false,
}).handler(async (): Promise<RegistryCatalog> => {
  const builtinCatalog = getCatalog();
  const ds = await getDataSource();
  const repo = ds.getRepository(CustomComponent);
  const dbComponents = await repo.find();
  const customEntries: CustomComponentEntry[] = dbComponents.map((c) => ({
    ref: `components/${c.namespace}-${c.type}`,
    displayName: `${c.namespace}/${c.type}`,
    namespace: c.namespace,
    type: c.type,
    definition: c.definition,
  }));
  return { ...builtinCatalog, custom: customEntries };
});

export const getRegistryItemFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ref: z.string() }))
  .handler(async ({ data }) => {
    const catalog = await getCatalogFn();
    const item = getRegistryItem(data.ref, catalog);
    if (!item) {
      throw new Error(`Registry item not found for ref: ${data.ref}`);
    }
    return item;
  });

export const getBuilderMetadata = createServerFn({ method: "GET" }).handler(
  async () => {
    return {
      behaviourDescriptors: BEHAVIOUR_TYPE_DESCRIPTORS,
      validationDescriptors: VALIDATION_RULE_DESCRIPTORS,
    };
  },
);

export const validateRecipe = createServerFn({ method: "POST", strict: false })
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ValidationResult> => {
    return validateFormContract(data.recipe);
  });

export const previewRecipe = createServerFn({ method: "POST", strict: false })
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ServiceContract> => {
    const recipe = data.recipe as ServiceContractRecipe;
    const catalog = await getCatalogFn();
    return hydrateForm(recipe, catalog);
  });
