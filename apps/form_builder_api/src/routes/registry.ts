import { Router } from "express";
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
import { CustomComponent } from "@govtech-bb/database";
import { getDataSource } from "../db.js";

export const registryRouter = Router();

let _catalogCache: { data: RegistryCatalog; expiresAt: number } | null = null;

async function getFullCatalog(): Promise<RegistryCatalog> {
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

// GET /builder/registry/catalog
registryRouter.get("/catalog", async (_req, res) => {
  try {
    const catalog = await getFullCatalog();
    res.json(catalog);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /builder/registry/item?ref=...
registryRouter.get("/item", async (req, res) => {
  try {
    const ref = req.query.ref as string;
    if (!ref) {
      res.status(400).json({ error: "ref query param required" });
      return;
    }
    const catalog = await getFullCatalog();
    const item = getRegistryItem(ref, catalog);
    if (!item) {
      res.status(404).json({ error: `Registry item not found: ${ref}` });
      return;
    }
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /builder/registry/metadata
registryRouter.get("/metadata", async (_req, res) => {
  res.json({
    behaviourDescriptors: BEHAVIOUR_TYPE_DESCRIPTORS,
    validationDescriptors: VALIDATION_RULE_DESCRIPTORS,
  });
});

// POST /builder/registry/validate
registryRouter.post("/validate", async (req, res) => {
  try {
    const result = validateFormContract(req.body.recipe);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /builder/registry/preview
registryRouter.post("/preview", async (req, res) => {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    const catalog = await getFullCatalog();
    const contract: ServiceContract = hydrateForm(recipe, catalog);
    res.json(contract);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
