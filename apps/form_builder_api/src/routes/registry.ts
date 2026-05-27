import { Router } from "express";
import {
  getRegistryItem,
  hydrateForm,
  validateFormContract,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  BEHAVIOUR_TYPE_DESCRIPTORS,
  VALIDATION_RULE_DESCRIPTORS,
} from "@govtech-bb/form-builder";
import type {
  ServiceContractRecipe,
  ServiceContract,
} from "@govtech-bb/form-types";
import { getFullCatalog } from "../catalog.js";

export const registryRouter = Router();

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
    if (!result.ok) {
      res.json(result);
      return;
    }
    // Contract parse passed — now backstop recipe-wide fieldId/stepId
    // uniqueness, which the Zod schema can't check (it has no catalog to
    // resolve defaults). Catalog-dependent, so it lives here, not in
    // validateFormContract (ADR 0010).
    const catalog = await getFullCatalog();
    const collisions = findRecipeIdCollisionsFromRecipe(result.data, catalog);
    const issues = formatCollisionIssues(collisions);
    if (issues.length > 0) {
      res.json({ ok: false, issues });
      return;
    }
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
