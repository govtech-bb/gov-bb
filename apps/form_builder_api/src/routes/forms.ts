import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { FormDefinitionEntity } from "@govtech-bb/database";
import {
  processorSchema,
  type ServiceContractRecipe,
} from "@govtech-bb/form-types";
import { getDataSource } from "../db.js";

export const formsRouter = Router();

// Author-time processors array, validated as a focused subset of the full
// recipe schema. The form-save endpoints below write the recipe straight into
// `form_definitions` (builder scratch that the Deploy PR copies verbatim into
// the runtime `recipes/` tree), so an unvalidated `processors[]` planted by
// prompt injection or a tampered request reaches the live submission pipeline.
// We gate `processors[]` specifically — not the whole recipe — because a recipe
// may legitimately omit other fields (ADR 0010) and the discriminated union is
// what rejects the dangerous shapes: an unknown processor `type`, a non-object
// entry, or a config missing required keys (e.g. a payment with no
// `paymentCode`/`amount`).
//
// Two deliberate gaps, both handled elsewhere:
//   - Templatable string fields are `dynamic(...)` = `string | jsonLogic-rule`,
//     so a field like the webhook `url` only fails the gate when sent as a
//     non-URL *string* — an object value parses as a template rule. URL shape is
//     enforced after template resolution, not here.
//   - This is a type/shape gate, not an SSRF gate: the `opencrvs`/`spreadsheet`
//     configs are by design an arbitrary `Record<string, string | number>`, so
//     a planted endpoint URL still parses here. Blocking the outbound target is
//     the companion host/scheme-allowlist work, layered at processor execution
//     time (defence in depth).
const recipeProcessorsSchema = z.array(processorSchema).optional();

type ProcessorValidation =
  | { ok: true }
  | { ok: false; issues: { path: string; message: string }[] };

// Validate-as-gate: we never persist the parsed output (which would strip
// unrendered config keys such as the webhook `secret`, breaking the round-trip
// guaranteed by ADR 0013/0014) — only the original recipe is stored. This just
// decides whether the write is allowed.
function validateRecipeProcessors(recipe: unknown): ProcessorValidation {
  const processors = (recipe as { processors?: unknown } | null | undefined)
    ?.processors;
  const parsed = recipeProcessorsSchema.safeParse(processors);
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: ["processors", ...i.path].join("."),
      message: i.message,
    })),
  };
}

// 422 body shared by both write handlers when `processors[]` fails the gate.
function rejectInvalidProcessors(
  res: Response,
  issues: { path: string; message: string }[],
): void {
  res.status(422).json({
    error:
      "Recipe has an invalid processor configuration and was not saved. " +
      "Every processor must declare a known type and a config matching that " +
      "type's shape.",
    issues,
  });
}

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

// POST /builder/forms — submit a new recipe
export async function submitRecipeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    if (!recipe?.formId || !recipe?.version) {
      res.status(400).json({ error: "recipe must have formId and version" });
      return;
    }
    // Reject planted/malformed processors before any DB work — see
    // recipeProcessorsSchema.
    const processorCheck = validateRecipeProcessors(recipe);
    if (!processorCheck.ok) {
      rejectInvalidProcessors(res, processorCheck.issues);
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
formsRouter.post("/", submitRecipeHandler);

// PUT /builder/forms/:formId — update existing draft
export async function updateRecipeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const recipe = req.body.recipe as ServiceContractRecipe;
    // Reject planted/malformed processors before any DB work — see
    // recipeProcessorsSchema.
    const processorCheck = validateRecipeProcessors(recipe);
    if (!processorCheck.ok) {
      rejectInvalidProcessors(res, processorCheck.issues);
      return;
    }
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
    await ds.query(`UPDATE form_definitions SET schema = $1 WHERE id = $2`, [
      recipe,
      rows[0].id,
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.put("/:formId", updateRecipeHandler);

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

// DELETE /builder/forms/:formId — hard-remove every version of a form and
// write a tombstone so the form_id stays claimed (public fetch -> 410 Gone).
// Submitted data (form_submissions) is deliberately never touched.
//
// Column names (form_id, reason, disabled_by, disabled_at) are pinned to
// apps/api's FormDisabledOverrideEntity — that app owns the table and its
// migration; this app writes it via raw SQL over the shared DB.
const deleteFormBodySchema = z.object({
  reason: z.string().min(1).max(2000),
  deletedBy: z.string().min(1).max(255),
});

export async function deleteFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = deleteFormBodySchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ");
    res.status(400).json({ error: detail || "Invalid request body" });
    return;
  }
  const { reason, deletedBy } = parsed.data;
  const { formId } = req.params;

  try {
    const ds = await getDataSource();
    const result = await ds.transaction(async (manager) => {
      // Unknown form: no versions AND no existing tombstone -> 404, no write.
      const defs = await manager.query(
        `SELECT 1 FROM form_definitions WHERE form_id = $1 LIMIT 1`,
        [formId],
      );
      const existing = await manager.query(
        `SELECT 1 FROM form_disabled_overrides WHERE form_id = $1 LIMIT 1`,
        [formId],
      );
      if (defs.length === 0 && existing.length === 0) {
        return { notFound: true as const };
      }

      const deleted = await manager.query(
        `DELETE FROM form_definitions WHERE form_id = $1 RETURNING id`,
        [formId],
      );
      await manager.query(
        `INSERT INTO form_disabled_overrides (form_id, reason, disabled_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (form_id) DO UPDATE
         SET reason = EXCLUDED.reason, disabled_by = EXCLUDED.disabled_by`,
        [formId, reason, deletedBy],
      );
      return { notFound: false as const, deletedVersions: deleted.length };
    });

    if (result.notFound) {
      res.status(404).json({ error: `No form found for formId: ${formId}` });
      return;
    }
    res.json({ ok: true, deletedVersions: result.deletedVersions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.delete("/:formId", deleteFormHandler);
