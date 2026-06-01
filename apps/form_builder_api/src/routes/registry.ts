import { Router } from "express";
import type { Request, Response } from "express";
import {
  getRegistryItem,
  hydrateForm,
  validateFormContract,
  findRecipeIdCollisionsFromRecipe,
  formatCollisionIssues,
  collectUnknownRefs,
  BEHAVIOUR_TYPE_DESCRIPTORS,
  VALIDATION_RULE_DESCRIPTORS,
} from "@govtech-bb/form-builder";
import type {
  ServiceContractRecipe,
  ServiceContract,
  ValidationIssue,
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
export async function validateHandler(req: Request, res: Response) {
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
    // Catalog-dependent ref existence check (also ADR 0010): the schema only
    // validates ref *format*, so a ref to a removed/renamed component passes
    // parse but would silently drop in preview / throw in the renderer. Catch
    // it here via the shared collector, reporting every unknown ref together.
    const unknownRefIssues: ValidationIssue[] = collectUnknownRefs(
      result.data,
      catalog,
    ).map(({ ref, path }) => ({
      path,
      message: `Unknown component/block ref "${ref}"`,
    }));
    if (unknownRefIssues.length > 0) {
      res.json({ ok: false, issues: unknownRefIssues });
      return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
registryRouter.post("/validate", validateHandler);

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
