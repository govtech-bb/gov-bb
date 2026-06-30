import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCatalog, ttlCache } from "@govtech-bb/form-builder";
import type {
  RegistryCatalog,
  ValidationResult,
} from "@govtech-bb/form-builder";
import type { ServiceContract } from "@govtech-bb/form-types";

import { api } from "./api-client";
import { requireSession } from "./auth/require-session";

// 60s SSR-side cache. The API has its own cache too; this saves a network
// round-trip on hot routes (e.g. catalog reads in the recipe-edit UI).
const loadCatalog = ttlCache(async (): Promise<RegistryCatalog> => {
  try {
    return await api.get<RegistryCatalog>("/builder/registry/catalog");
  } catch (err) {
    // Local dev fallback: no BUILDER_API_URL/ADMIN_API_TOKEN configured —
    // serve the package's built-in registry catalog (no `custom` entries)
    // so /builder renders without a running API. Prod still throws.
    if (!import.meta.env.DEV) throw err;
    return getCatalog();
  }
}, 60_000);

export const getCatalogFn = createServerFn({
  method: "GET",
  strict: false,
})
  .middleware([requireSession])
  .handler((): Promise<RegistryCatalog> => loadCatalog());

export const validateRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ValidationResult> => {
    return api.post<ValidationResult>("/builder/registry/validate", {
      recipe: data.recipe,
    });
  });

export const previewRecipe = createServerFn({ method: "POST", strict: false })
  .middleware([requireSession])
  .inputValidator(z.object({ recipe: z.unknown() }))
  .handler(async ({ data }): Promise<ServiceContract> => {
    return api.post<ServiceContract>("/builder/registry/preview", {
      recipe: data.recipe,
    });
  });
