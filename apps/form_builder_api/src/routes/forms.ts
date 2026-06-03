import { Router, type Request, type Response } from "express";
import type { EntityManager } from "typeorm";
import { z } from "zod";
import { FormDefinitionEntity, FormConfigEntity } from "@govtech-bb/database";
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

// The save/update body may carry a sibling `mdaContactId` alongside `recipe`.
// It's DB-only (form_config) — never written into the recipe. Absent means
// "leave form_config untouched"; an explicit value (incl. null) is persisted.
// `null` clears the contact (FK is ON DELETE SET NULL); a string is an
// mda_contact id the builder guarantees exists.
const mdaContactIdSchema = z.union([z.string(), z.null()]);

// Read the optional `mdaContactId` off a request body. Returns `undefined` when
// the field is absent (no form_config write) or when it fails validation (we
// don't want a malformed sibling field to block a valid recipe save — the
// builder owns this value and only ever sends a real id or null).
function readMdaContactId(body: unknown): string | null | undefined {
  if (typeof body !== "object" || body === null || !("mdaContactId" in body)) {
    return undefined;
  }
  const parsed = mdaContactIdSchema.safeParse(
    (body as { mdaContactId: unknown }).mdaContactId,
  );
  return parsed.success ? parsed.data : undefined;
}

// Upsert the per-form config (form_config) within the recipe-save transaction
// so the recipe write and the contact link commit atomically. Conflict column
// is form_config.form_id (the Session-1 unique index).
async function upsertFormConfig(
  manager: EntityManager,
  formId: string,
  mdaContactId: string | null,
): Promise<void> {
  await manager
    .getRepository(FormConfigEntity)
    .upsert({ formId, mdaContactId }, ["formId"]);
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

// A published form as exposed by apps/api's recipe index.
export interface PublishedForm {
  formId: string;
  title: string;
  version: string;
}

// Result of consulting the upstream published set. Callers decide how to react:
// the proxy surfaces `config` as 500 and `upstream` as 502; the write path
// fails open (treats any failure as an empty published set).
type FetchPublishedResult =
  | { ok: true; data: PublishedForm[] }
  | { ok: false; kind: "config"; error: string }
  | {
      ok: false;
      kind: "upstream";
      error: string;
      upstreamStatus?: number;
      upstreamBody?: string;
    };

// Adding the upstream call to the write path means a *hanging* upstream would
// otherwise stall saves indefinitely — fail-open only rescues an upstream that
// fails fast. The timeout converts a hang into a fast failure. ~2.5s is the
// smallest bound that shouldn't trip a warm-but-loaded upstream.
const PUBLISHED_FETCH_TIMEOUT_MS = 2500;

// Fetch apps/api's published-recipe index, owning the URL build, the SSRF
// protocol guard, a bounded timeout, and the success/failure distinction.
// Shared by listPublishedHandler (the proxy) and the write handlers (uniqueness
// backstop) so the fetch logic can't drift between them.
export async function fetchPublishedForms(): Promise<FetchPublishedResult> {
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
    return {
      ok: false,
      kind: "config",
      error: "API_BASE_URL is not a valid URL",
    };
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    return {
      ok: false,
      kind: "config",
      error: "API_BASE_URL must use http or https protocol",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    PUBLISHED_FETCH_TIMEOUT_MS,
  );
  try {
    const upstream = await fetch(
      `${baseUrl.replace(/\/$/, "")}/form-definitions`,
      {
        signal: controller.signal,
      },
    );
    if (!upstream.ok) {
      const upstreamBody = await upstream.text();
      return {
        ok: false,
        kind: "upstream",
        error: `Upstream apps/api returned ${upstream.status}`,
        upstreamStatus: upstream.status,
        upstreamBody,
      };
    }
    const body = (await upstream.json()) as { data?: PublishedForm[] } | null;
    // Guard the envelope: a 200 with a missing/non-array `data` (contract drift,
    // an error envelope, a bare `null`) must not crash the write path — coerce
    // to [] so the uniqueness check falls back to drafts-only rather than
    // throwing into a 500 and blocking every save.
    return { ok: true, data: Array.isArray(body?.data) ? body.data : [] };
  } catch (err: any) {
    return {
      ok: false,
      kind: "upstream",
      error: `Upstream apps/api request failed: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Consult the published set on the write path, failing open to an empty set so
// a flaky/slow upstream can't block all form creation (the UI mirror still
// guards the common interactive path). A warning makes a silent outage — and
// the resulting weakening of the backstop — observable.
async function fetchPublishedFormsFailOpen(): Promise<PublishedForm[]> {
  const result = await fetchPublishedForms();
  if (result.ok) return result.data;
  console.warn(
    `[forms] uniqueness check failing open — published set unavailable: ${result.error}`,
  );
  return [];
}

// GET /builder/forms/published — proxy apps/api's in-memory recipe index so
// the form_builder Open modal renders in <1s without hitting GitHub. Returns
// {formId,title,version}[]. Registered before "/:formId" so "published" isn't
// captured as a formId. Upstream errors surface as 502 so a flaky apps/api
// shows in the front-end rather than as a generic 500; a bad API_BASE_URL is a
// 500 (operator misconfiguration, not an upstream fault).
export async function listPublishedHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await fetchPublishedForms();
  if (result.ok) {
    res.json(result.data);
    return;
  }
  if (result.kind === "config") {
    res.status(500).json({ error: result.error });
    return;
  }
  const payload: Record<string, unknown> = { error: result.error };
  if (result.upstreamStatus !== undefined) {
    payload.upstreamStatus = result.upstreamStatus;
  }
  if (result.upstreamBody !== undefined) {
    payload.upstreamBody = result.upstreamBody;
  }
  res.status(502).json(payload);
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

// GET /builder/forms/:formId/config — the per-form config (form_config). Today
// that's just the linked MDA contact id; returns null when no row exists (the
// form has never had a contact set). Distinct path depth from "/:formId" so the
// router never confuses the two.
export async function getFormConfigHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ds = await getDataSource();
    const row = await ds.getRepository(FormConfigEntity).findOne({
      where: { formId: String(req.params.formId) },
    });
    res.json({ mdaContactId: row?.mdaContactId ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.get("/:formId/config", getFormConfigHandler);

// Query the latest version of every form and return whichever (if any) has a
// title that collides with `title` (case-insensitive, whitespace-trimmed),
// ignoring `excludeFormId` so a form never collides with itself. Reuses the
// same "latest version per formId" aggregation that powers GET /builder/forms.
// `publishedRows` lets a caller fold the upstream published set into the check
// (issue #556) so a title that collides only with a published-only form is
// caught here, not just in the UI mirror. Draft+published overlap is harmless:
// `excludeFormId` skips self, and any other matching row wins regardless of
// duplicates.
async function findTitleCollisionInDb(
  // Accept anything that can run a query — the live DataSource (create/update
  // paths) or a transaction's EntityManager (the re-key path) — since this only
  // needs `.query`.
  ds: { query: (sql: string) => Promise<FormTitleRow[]> },
  title: string,
  excludeFormId: string,
  publishedRows: FormTitleRow[] = [],
): Promise<FormTitleRow | null> {
  const rows: FormTitleRow[] = await ds.query(
    latestVersionPerFormSql("form_id, schema->>'title' AS title"),
  );
  return findTitleCollision([...rows, ...publishedRows], title, excludeFormId);
}

// Map upstream published entries onto the FormTitleRow shape used by the title
// check, so they concatenate cleanly with the DB rows.
function publishedToTitleRows(published: PublishedForm[]): FormTitleRow[] {
  return published.map((p) => ({ form_id: p.formId, title: p.title }));
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
    // Consult the upstream published set as well as the local drafts, so a
    // collision against a published-only form is blocked here too (issue #556).
    // Fails open to [] if upstream is down — the UI mirror still guards the
    // common path.
    const publishedForms = await fetchPublishedFormsFailOpen();
    // formId uniqueness — only for a create. A new form may not reuse a formId
    // that already belongs to another form (any version), draft or published.
    if (isNew) {
      const idRows = await ds.query(
        `SELECT 1 FROM form_definitions WHERE form_id = $1 LIMIT 1`,
        [recipe.formId],
      );
      const publishedHasId = publishedForms.some(
        (p) => p.formId === recipe.formId,
      );
      if (idRows.length > 0 || publishedHasId) {
        res.status(409).json({
          error: `A form with the ID "${recipe.formId}" already exists. Choose a different ID.`,
        });
        return;
      }
    }
    // title uniqueness — across the latest version of every other form (drafts
    // + published).
    const titleCollision = await findTitleCollisionInDb(
      ds,
      recipe.title ?? "",
      recipe.formId,
      publishedToTitleRows(publishedForms),
    );
    if (titleCollision) {
      res.status(409).json({
        error: `A form titled "${recipe.title}" already exists. Choose a different title.`,
      });
      return;
    }
    // Persist the recipe and (when supplied) the per-form config atomically:
    // a failed config upsert must not leave an orphaned recipe row, and vice
    // versa.
    const mdaContactId = readMdaContactId(req.body);
    await ds.transaction(async (manager) => {
      const txRepo = manager.getRepository(FormDefinitionEntity);
      await txRepo.save(
        txRepo.create({
          formId: recipe.formId,
          version: recipe.version,
          schema: recipe,
          publishedAt: null,
        }),
      );
      if (mdaContactId !== undefined) {
        await upsertFormConfig(manager, recipe.formId, mdaContactId);
      }
    });
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
    // title uniqueness on rename — reject renaming into another form's title
    // (drafts + published), while keeping this form's own title (excluded by
    // formId) is allowed. formId is not reassigned on update, so there's no
    // published-formId check here. Fails open if upstream is down.
    const publishedForms = await fetchPublishedFormsFailOpen();
    const titleCollision = await findTitleCollisionInDb(
      ds,
      recipe.title ?? "",
      String(req.params.formId),
      publishedToTitleRows(publishedForms),
    );
    if (titleCollision) {
      res.status(409).json({
        error: `A form titled "${recipe.title}" already exists. Choose a different title.`,
      });
      return;
    }
    // Update the recipe and (when supplied) the per-form config atomically.
    const mdaContactId = readMdaContactId(req.body);
    await ds.transaction(async (manager) => {
      await manager.query(
        `UPDATE form_definitions SET schema = $1 WHERE id = $2`,
        [recipe, rows[0].id],
      );
      if (mdaContactId !== undefined) {
        await upsertFormConfig(
          manager,
          String(req.params.formId),
          mdaContactId,
        );
      }
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.put("/:formId", updateFormHandler);

// POST /builder/forms/:formId/rekey — change the Form ID of an existing
// draft-only form in one atomic operation (issue #674). `:formId` is the *old*
// ID; `recipe.formId` is the *new* ID. Without this, the UI models an ID change
// as a create, whose title check fires against the form's own prior record (a
// false self-collision) and which would leave a stale old-ID row behind.
//
// The whole thing runs in one transaction so there's never a half-applied move:
//   1. Load the old-ID rows; 404 if none.
//   2. Block if published — any old-ID DB row with published_at set (the
//      authoritative signal) or the old ID appearing in the upstream published
//      set (fails open). Published forms live upstream and aren't ours to move.
//   3. New-ID uniqueness against *other* forms (drafts + published), excluding
//      the old ID, reusing the create path's id-collision message.
//   4. Title uniqueness with excludeFormId = oldFormId so the form's own prior
//      record is skipped (this is the false-collision fix).
//   5. Move every old-ID row to the new ID (all guaranteed drafts by step 2).
//   6. Persist the saved version's content under the new ID: UPDATE the
//      just-moved row if (newId, version) now exists, else INSERT (covers a
//      re-key combined with a version bump).
export async function rekeyFormHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const oldFormId = String(req.params.formId);
    const recipe = req.body.recipe as ServiceContractRecipe;
    if (!recipe?.formId || !recipe?.version) {
      res.status(400).json({ error: "recipe must have formId and version" });
      return;
    }
    const newFormId = recipe.formId;
    const ds = await getDataSource();
    const result = await ds.transaction(async (manager) => {
      // 1. Load the old-ID rows.
      const oldRows: {
        id: string;
        version: string;
        published_at: string | null;
      }[] = await manager.query(
        `SELECT id, version, published_at, schema FROM form_definitions WHERE form_id = $1`,
        [oldFormId],
      );
      if (!oldRows.length) {
        return {
          status: 404,
          body: { error: `No recipe found for formId: ${oldFormId}` },
        };
      }
      // Consult the upstream published set once; reuse it for the published
      // guard and the new-ID/title uniqueness checks. Fails open to [].
      const publishedForms = await fetchPublishedFormsFailOpen();
      // 2. Block if published.
      const dbPublished = oldRows.some((r) => r.published_at !== null);
      const upstreamPublished = publishedForms.some(
        (p) => p.formId === oldFormId,
      );
      if (dbPublished || upstreamPublished) {
        return {
          status: 409,
          body: { error: "Cannot change the ID of a published form" },
        };
      }
      // 3. New-ID uniqueness against other forms (drafts + published).
      const idRows = await manager.query(
        `SELECT 1 FROM form_definitions WHERE form_id = $1 AND form_id <> $2 LIMIT 1`,
        [newFormId, oldFormId],
      );
      const publishedHasNewId = publishedForms.some(
        (p) => p.formId === newFormId,
      );
      if (idRows.length > 0 || publishedHasNewId) {
        return {
          status: 409,
          body: {
            error: `A form with the ID "${newFormId}" already exists. Choose a different ID.`,
          },
        };
      }
      // 4. Title uniqueness, excluding the form's own prior record.
      const titleCollision = await findTitleCollisionInDb(
        manager,
        recipe.title ?? "",
        oldFormId,
        publishedToTitleRows(publishedForms),
      );
      if (titleCollision) {
        return {
          status: 409,
          body: {
            error: `A form titled "${recipe.title}" already exists. Choose a different title.`,
          },
        };
      }
      // 5. Move the rows to the new ID. Step 3 guarantees no (newId, *) row
      // exists, so this can't trip the UNIQUE(form_id, version) constraint.
      // Deliberately leaves any old-ID form_disabled_overrides tombstone in
      // place (the old ID stays claimed) — a re-key only moves the draft rows.
      // This is unreachable in practice: listForms drops disabled-and-
      // unpublished drafts, so a disabled draft can't be opened to re-key.
      await manager.query(
        `UPDATE form_definitions SET form_id = $1 WHERE form_id = $2`,
        [newFormId, oldFormId],
      );
      // Move the per-form config (the MDA contact link) to the new ID too, so a
      // re-key keeps its config.mdaEmail recipient instead of orphaning the
      // form_config row under the old ID (#732). No-op when the form has no
      // config row. form_config.form_id is unique and step 3 guarantees the new
      // ID is otherwise unused, so this can't collide.
      await manager.query(
        `UPDATE form_config SET form_id = $1 WHERE form_id = $2`,
        [newFormId, oldFormId],
      );
      // 6. Persist the saved version's content under the new ID.
      const existing = await manager.query(
        `SELECT id FROM form_definitions WHERE form_id = $1 AND version = $2 LIMIT 1`,
        [newFormId, recipe.version],
      );
      if (existing.length > 0) {
        await manager.query(
          `UPDATE form_definitions SET schema = $1 WHERE id = $2`,
          [recipe, existing[0].id],
        );
      } else {
        const repo = manager.getRepository(FormDefinitionEntity);
        await repo.save(
          repo.create({
            formId: newFormId,
            version: recipe.version,
            schema: recipe,
            publishedAt: null,
          }),
        );
      }
      return { status: 200, body: { ok: true } };
    });
    res.status(result.status).json(result.body);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
formsRouter.post("/:formId/rekey", rekeyFormHandler);

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
