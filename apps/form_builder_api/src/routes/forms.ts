import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { FormDefinitionEntity } from "@govtech-bb/database";
import {
  serviceContractRecipeSchema,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { getDataSource } from "../db.js";
import {
  latestVersionPerFormSql,
  findTitleCollision,
  type FormTitleRow,
} from "./form-uniqueness.js";

export const formsRouter = Router();

// Upstream apps/api base URL for the published-recipe proxy. Falls back to the
// sandbox API when API_BASE_URL is unset so the form_builder "Open" modal works
// out of the box (e.g. `dev` without a local apps/api). No trailing slash —
// listPublishedHandler appends "/form-definitions".
const DEFAULT_API_BASE_URL = "https://forms.api.sandbox.alpha.gov.bb";

// GET /builder/forms/disabled — form_ids with a tombstone (deleted/disabled).
// Registered before "/:formId" so "disabled" isn't captured as a formId.
export async function listDisabledHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const ds = await getDataSource();
    const rows = await ds.query(`SELECT form_id FROM form_disabled_overrides`);
    res.json(rows.map((r: { form_id: string }) => r.form_id));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.get("/disabled", listDisabledHandler);

// GET /builder/forms/published — proxy apps/api's in-memory recipe index so
// the form_builder Open modal renders in <1s without hitting GitHub. Returns
// {formId,title,version}[]. Registered before "/:formId" so "published" isn't
// captured as a formId. Upstream errors surface as 502 so a flaky apps/api
// shows in the front-end rather than as a generic 500.
export async function listPublishedHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const baseUrl = process.env.API_BASE_URL || DEFAULT_API_BASE_URL;
  // Parse + protocol-check the configured upstream so a malformed or
  // non-http(s) API_BASE_URL can't turn this proxy into an SSRF primitive
  // (e.g. file://, gopher://). API_BASE_URL is operator-controlled config,
  // not user input, but validating it cheaply at the boundary is worth the
  // line count.
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    res.status(500).json({ error: "API_BASE_URL is not a valid URL" });
    return;
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    res
      .status(500)
      .json({ error: "API_BASE_URL must use http or https protocol" });
    return;
  }
  try {
    const upstream = await fetch(
      `${baseUrl.replace(/\/$/, "")}/form-definitions`,
    );
    if (!upstream.ok) {
      const upstreamBody = await upstream.text();
      res.status(502).json({
        error: `Upstream apps/api returned ${upstream.status}`,
        upstreamStatus: upstream.status,
        upstreamBody,
      });
      return;
    }
    const body = (await upstream.json()) as {
      data: { formId: string; title: string; version: string }[];
    };
    res.json(body.data);
  } catch (err: any) {
    res.status(502).json({
      error: `Upstream apps/api request failed: ${err.message}`,
    });
  }
}
formsRouter.get("/published", listPublishedHandler);

// GET /builder/forms — list all forms (latest version per formId)
formsRouter.get("/", async (_req, res) => {
  try {
    const ds = await getDataSource();
    const rows = await ds.query(
      latestVersionPerFormSql(
        "id, form_id, schema->>'title' AS title, version, schema",
      ),
    );
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
      res
        .status(404)
        .json({ error: `No recipe found for formId: ${req.params.formId}` });
      return;
    }
    res.json(rows[0].schema);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Query the latest version of every form and return whichever (if any) has a
// title that collides with `title` (case-insensitive, whitespace-trimmed),
// ignoring `excludeFormId` so a form never collides with itself. Reuses the
// same "latest version per formId" aggregation that powers GET /builder/forms.
async function findTitleCollisionInDb(
  ds: Awaited<ReturnType<typeof getDataSource>>,
  title: string,
  excludeFormId: string,
): Promise<FormTitleRow | null> {
  const rows: FormTitleRow[] = await ds.query(
    latestVersionPerFormSql("form_id, schema->>'title' AS title"),
  );
  return findTitleCollision(rows, title, excludeFormId);
}

// POST /builder/forms — submit a new recipe.
//
// `isNew` flags a brand-new form (vs. a new *version* of an existing one — both
// flow through here). It's the only signal that distinguishes the two at the
// API: when set, reusing an existing formId is rejected; new versions keep
// their id and are unaffected.
export async function createFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    const isNew = req.body.isNew === true;
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
      res.status(409).json({
        error: `Recipe ${recipe.formId} v${recipe.version} already exists`,
      });
      return;
    }
    // formId uniqueness — only for a create. A new form may not reuse a formId
    // that already belongs to another form (any version).
    if (isNew) {
      const idRows = await ds.query(
        `SELECT 1 FROM form_definitions WHERE form_id = $1 LIMIT 1`,
        [recipe.formId],
      );
      if (idRows.length > 0) {
        res.status(409).json({
          error: `A form with the ID "${recipe.formId}" already exists. Choose a different ID.`,
        });
        return;
      }
    }
    // title uniqueness — across the latest version of every other form.
    const titleCollision = await findTitleCollisionInDb(
      ds,
      recipe.title ?? "",
      recipe.formId,
    );
    if (titleCollision) {
      res.status(409).json({
        error: `A form titled "${recipe.title}" already exists. Choose a different title.`,
      });
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
}
formsRouter.post("/", createFormHandler);

// PUT /builder/forms/:formId — update existing draft
export async function updateFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
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
      res
        .status(404)
        .json({ error: `No recipe found for formId: ${req.params.formId}` });
      return;
    }
    if (rows[0].published_at !== null) {
      res.status(400).json({ error: "Cannot update a published recipe" });
      return;
    }
    if (recipe.version !== rows[0].version) {
      res.status(409).json({
        error: `Version mismatch: stored=${rows[0].version}, provided=${recipe.version}`,
      });
      return;
    }
    // title uniqueness on rename — reject renaming into another form's title,
    // while keeping this form's own title (excluded by formId) is allowed.
    const titleCollision = await findTitleCollisionInDb(
      ds,
      recipe.title ?? "",
      String(req.params.formId),
    );
    if (titleCollision) {
      res.status(409).json({
        error: `A form titled "${recipe.title}" already exists. Choose a different title.`,
      });
      return;
    }
    await ds.query(`UPDATE form_definitions SET schema = $1 WHERE id = $2`, [
      recipe,
      rows[0].id,
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.put("/:formId", updateFormHandler);

// DELETE /builder/forms/:formId/versions/:version — surgically remove a single
// draft version row. Unlike the form-level delete below, this writes NO
// tombstone and never touches form_disabled_overrides: it's for pruning a
// superseded draft (e.g. a stale row the published copy already beats), leaving
// the formId fully usable. 404 if no such row; 400 if the row is published
// (mirrors the PUT guard — only DB-resident drafts are mutable).
export async function deleteFormVersionHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { formId, version } = req.params;
  try {
    const ds = await getDataSource();
    const rows = await ds.query(
      `SELECT id, published_at FROM form_definitions
       WHERE form_id = $1 AND version = $2
       LIMIT 1`,
      [formId, version],
    );
    if (!rows.length) {
      res.status(404).json({
        error: `No recipe found for formId: ${formId} version: ${version}`,
      });
      return;
    }
    if (rows[0].published_at !== null) {
      res.status(400).json({ error: "Cannot delete a published recipe" });
      return;
    }
    await ds.query(`DELETE FROM form_definitions WHERE id = $1`, [rows[0].id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
// Registered before the catch-all "/:formId" delete so the extra path segments
// are matched here, not swallowed as a formId.
formsRouter.delete("/:formId/versions/:version", deleteFormVersionHandler);

// POST /builder/forms/:formId/disable — write/refresh a tombstone so the
// form_id stays claimed (public fetch -> 410 Gone) without deleting any
// drafts. Idempotent: re-disabling updates the reason/author.
//
// Column names (form_id, reason, disabled_by) are pinned to apps/api's
// FormDisabledOverrideEntity — that app owns the table and its migration;
// this app writes it via raw SQL over the shared DB.
const disableFormBodySchema = z.object({
  reason: z.string().min(1).max(2000),
  disabledBy: z.string().min(1).max(255),
});

export async function disableFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = disableFormBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: detail || "Invalid request body" });
    return;
  }
  const { reason, disabledBy } = parsed.data;
  const { formId } = req.params;

  try {
    const ds = await getDataSource();
    await ds.query(
      `INSERT INTO form_disabled_overrides (form_id, reason, disabled_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (form_id) DO UPDATE
       SET reason = EXCLUDED.reason, disabled_by = EXCLUDED.disabled_by`,
      [formId, reason, disabledBy],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.post("/:formId/disable", disableFormHandler);

// DELETE /builder/forms/:formId/disabled — clear the tombstone, re-enabling
// the form. Idempotent: a missing row still returns 200 (no branch on count).
export async function enableFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { formId } = req.params;
  try {
    const ds = await getDataSource();
    await ds.query(`DELETE FROM form_disabled_overrides WHERE form_id = $1`, [
      formId,
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
// Registered before the catch-all "/:formId" delete so the extra "/disabled"
// path segment is matched here, not swallowed as a formId.
formsRouter.delete("/:formId/disabled", enableFormHandler);

// DELETE /builder/forms/:formId — hard-remove every draft version of a form.
// No tombstone is written here: deleting a form is a pure draft delete, and
// claiming the form_id is the separate POST /:formId/disable concern.
// Submitted data (form_submissions) is deliberately never touched.
export async function deleteFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { formId } = req.params;
  try {
    const ds = await getDataSource();
    const result = await ds.transaction(async (manager) => {
      const deleted = await manager.query(
        `DELETE FROM form_definitions WHERE form_id = $1 RETURNING id`,
        [formId],
      );
      return { deletedVersions: deleted.length };
    });

    // No form_definitions rows -> nothing was deleted -> 404.
    if (result.deletedVersions === 0) {
      res.status(404).json({ error: `No form found for formId: ${formId}` });
      return;
    }
    res.json({ ok: true, deletedVersions: result.deletedVersions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.delete("/:formId", deleteFormHandler);
