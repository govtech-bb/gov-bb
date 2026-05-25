import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  RegistryCatalog,
  CustomComponentEntry,
  ValidationResult,
  ValidationRuleDescriptor,
} from "@govtech-bb/form-builder";
import type { ServiceContract } from "@govtech-bb/form-types";

// BEHAVIOUR_TYPE_DESCRIPTORS has no exported type; consumers use the JSON shape.
type BehaviourTypeDescriptor = Record<string, unknown>;
import { api } from "./api-client";
import { requireAdminToken } from "./auth/admin-token-middleware";

// 60s SSR-side cache. The API has its own cache too; this saves a network
// round-trip on hot routes (e.g. catalog reads in the recipe-edit UI).
let _catalogCache: { data: RegistryCatalog; expiresAt: number } | null = null;

export const getCatalogFn = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([requireAdminToken])
  .handler(async (): Promise<RegistryCatalog> => {
    const now = Date.now();
    if (_catalogCache && _catalogCache.expiresAt > now) {
      return _catalogCache.data;
    }
    const catalog = await api.get<RegistryCatalog>("/builder/registry/catalog");
    _catalogCache = { data: catalog, expiresAt: now + 60_000 };
    return catalog;
  });

export const getRegistryItemFn = createServerFn({ method: "GET" })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ ref: z.string() }))
  .handler(async ({ data }): Promise<CustomComponentEntry> => {
    return api.get<CustomComponentEntry>(
      `/builder/registry/item?ref=${encodeURIComponent(data.ref)}`,
    );
  });

export const getBuilderMetadata = createServerFn({ method: "GET" })
  .middleware([requireAdminToken])
  .handler(
    async (): Promise<{
      behaviourDescriptors: readonly BehaviourTypeDescriptor[];
      validationDescriptors: readonly ValidationRuleDescriptor[];
    }> => {
      return api.get("/builder/registry/metadata");
    },
  );

export const validateRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ValidationResult> => {
    return api.post<ValidationResult>("/builder/registry/validate", {
      recipe: data.recipe,
    });
  });

export const previewRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireAdminToken])
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ServiceContract> => {
    return api.post<ServiceContract>("/builder/registry/preview", {
      recipe: data.recipe,
    });
  });
