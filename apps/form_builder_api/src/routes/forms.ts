import { Router } from "express";
import { FormDefinitionEntity } from "@govtech-bb/database";
import { serviceContractRecipeSchema, type ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "../db.js";

export const formsRouter = Router();

// GET /builder/forms — list all forms (latest version per formId)
formsRouter.get("/", async (_req, res) => {
  try {
    const ds = await getDataSource();
    const rows = await ds.query(`
      SELECT DISTINCT ON (form_id)
        id, form_id, schema->>'title' AS title, version, schema
      FROM form_definitions
      ORDER BY form_id, string_to_array(version, '.')::int[] DESC
    `);
    const forms = rows.map((r: any) => ({
      id: r.id,
      formId: r.form_id,
      title: r.title ?? r.form_id,
      version: r.version,
      isPublished: false,
    }));
    res.json(forms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /builder/forms/:formId — get latest recipe for a form
formsRouter.get("/:formId", async (req, res) => {
  try {
    const ds = await getDataSource();
    const rows = await ds.query(
      `SELECT id, version, schema, published_at
       FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [req.params.formId],
    );
    if (!rows.length) {
      res.status(404).json({ error: `No recipe found for formId: ${req.params.formId}` });
      return;
    }
    res.json(rows[0].schema);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /builder/forms/:formId/next-version
formsRouter.get("/:formId/next-version", async (req, res) => {
  try {
    const ds = await getDataSource();
    const rows = await ds.query(
      `SELECT version FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [req.params.formId],
    );
    if (!rows.length) {
      res.json({ currentVersion: null, nextVersion: "1.0.0" });
      return;
    }
    const current = rows[0].version;
    const parts = current.split(".").map(Number);
    parts[1] = (parts[1] ?? 0) + 1;
    parts[2] = 0;
    res.json({ currentVersion: current, nextVersion: parts.join(".") });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /builder/forms — submit a new recipe
formsRouter.post("/", async (req, res) => {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    if (!recipe?.formId || !recipe?.version) {
      res.status(400).json({ error: "recipe must have formId and version" });
      return;
    }
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);
    const existing = await repo.findOne({
      where: { formId: recipe.formId, version: recipe.version },
    });
    if (existing) {
      res.status(409).json({ error: `Recipe ${recipe.formId} v${recipe.version} already exists` });
      return;
    }
    const entity = repo.create({
      formId: recipe.formId,
      version: recipe.version,
      schema: recipe,
      publishedAt: null,
    });
    await repo.save(entity);
    res.status(201).json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /builder/forms/:formId — update existing draft
formsRouter.put("/:formId", async (req, res) => {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    const ds = await getDataSource();
    const rows = await ds.query(
      `SELECT id, version, published_at FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [req.params.formId],
    );
    if (!rows.length) {
      res.status(404).json({ error: `No recipe found for formId: ${req.params.formId}` });
      return;
    }
    if (rows[0].published_at !== null) {
      res.status(400).json({ error: "Cannot update a published recipe" });
      return;
    }
    if (recipe.version !== rows[0].version) {
      res.status(409).json({ error: `Version mismatch: stored=${rows[0].version}, provided=${recipe.version}` });
      return;
    }
    await ds.query(`UPDATE form_definitions SET schema = $1 WHERE id = $2`, [recipe, rows[0].id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
