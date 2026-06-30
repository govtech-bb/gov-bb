import { getCatalog, ttlCache } from "@govtech-bb/form-builder";
import type {
  RegistryCatalog,
  CustomComponentEntry,
} from "@govtech-bb/form-builder";
import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "./db.js";

/**
 * Builtin catalog merged with the custom components stored in the DB, cached
 * for 60s. Shared by every route that needs catalog-aware resolution (the
 * registry routes and the AI publish backstop) so id-uniqueness checks resolve
 * the same defaults the live forms API sees.
 */
export const getFullCatalog = ttlCache(async (): Promise<RegistryCatalog> => {
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
}, 60_000);
