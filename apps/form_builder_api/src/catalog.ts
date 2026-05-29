import { getCatalog } from "@govtech-bb/form-builder";
import type {
  RegistryCatalog,
  CustomComponentEntry,
} from "@govtech-bb/form-builder";
import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "./db.js";

let _catalogCache: { data: RegistryCatalog; expiresAt: number } | null = null;

/**
 * Builtin catalog merged with the custom components stored in the DB, cached
 * for 60s. Shared by every route that needs catalog-aware resolution (the
 * registry routes and the AI publish backstop) so id-uniqueness checks resolve
 * the same defaults the live forms API sees.
 */
export async function getFullCatalog(): Promise<RegistryCatalog> {
  const now = Date.now();
  if (_catalogCache && _catalogCache.expiresAt > now) {
    return _catalogCache.data;
  }
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
  const catalog = { ...builtinCatalog, custom: customEntries };
  _catalogCache = { data: catalog, expiresAt: now + 60_000 };
  return catalog;
}
