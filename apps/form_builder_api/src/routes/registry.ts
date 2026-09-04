import { Router } from "express";
import type { Request, Response } from "express";
import {
  getRegistryItem,
  hydrateForm,
  BEHAVIOUR_TYPE_DESCRIPTORS,
  VALIDATION_RULE_DESCRIPTORS,
} from "@govtech-bb/form-builder";
import type {
  ServiceContractRecipe,
  ServiceContract,
} from "@govtech-bb/form-types";
import { getFullCatalog } from "../catalog.js";
import { validateRecipeFully } from "./validate-recipe.js";
import { badRequest, notFound } from "../lib/http-error.js";

export const registryRouter = Router();

// GET /builder/registry/catalog
registryRouter.get("/catalog", async (_req, res) => {
  const catalog = await getFullCatalog();
  res.json(catalog);
});

// GET /builder/registry/item?ref=...
registryRouter.get("/item", async (req, res) => {
  const ref = req.query.ref as string;
  if (!ref) {
    throw badRequest("ref query param required");
  }
  const catalog = await getFullCatalog();
  const item = getRegistryItem(ref, catalog);
  if (!item) {
    throw notFound(`Registry item not found: ${ref}`);
  }
  res.json(item);
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
  // The full schema + catalog-dependent (collision, unknown-ref) check lives
  // in the shared helper (ADR 0010). It was shared with POST /builder/publish
  // until that dormant route was removed; keeping the helper separate still
  // stops this endpoint drifting from any future server-side gate.
  const result = await validateRecipeFully(req.body.recipe);
  res.json(result);
}
registryRouter.post("/validate", validateHandler);

// POST /builder/registry/preview
registryRouter.post("/preview", async (req, res) => {
  const recipe = req.body.recipe as ServiceContractRecipe;
  const catalog = await getFullCatalog();
  const contract: ServiceContract = hydrateForm(recipe, catalog);
  res.json(contract);
});
