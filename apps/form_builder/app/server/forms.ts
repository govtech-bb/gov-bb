import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { FormDefinitionEntity } from "@govtech-bb/database";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "./db";
import { getSession } from "./session";
import { listPublishedForms, getPublishedRecipe } from "./github-recipes";
import { bumpMinor } from "../lib/version";
import type { FormDefinitionSummary } from "../types/index";

type FormDefinitionRow = {
  id: string;
  version: string;
  schema: ServiceContractRecipe;
  published_at: Date | null;
};

function requireToken(): string {
  const headers = getRequestHeaders();
  const cookie =
    (headers as { get?: (k: string) => string | null }).get?.("cookie") ??
    (headers as { cookie?: string }).cookie ??
    null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const session = getSession(cookie, secret);
  if (!session) throw new Error("Not authenticated");
  return session.accessToken;
}

export const listForms = createServerFn({ method: "GET" }).handler(
  async (): Promise<FormDefinitionSummary[]> => {
    const token = requireToken();
    const forms = await listPublishedForms(token);
    return forms.map((f) => ({
      // For GitHub-backed entries the formId is unique enough to serve as id.
      // (FormPicker only uses it for React keys.)
      id: f.formId,
      formId: f.formId,
      title: f.title,
      version: f.version,
      isPublished: true,
    }));
  },
);

export const getRecipe = createServerFn({ method: "GET", strict: false })
  .inputValidator(z.object({ formId: z.string() }))
  .handler(async ({ data }): Promise<ServiceContractRecipe> => {
    const token = requireToken();
    const recipe = await getPublishedRecipe(token, { formId: data.formId });
    return recipe as unknown as ServiceContractRecipe;
  });

export const submitRecipe = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const recipe = data.recipe as ServiceContractRecipe;
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);

    const existing = await repo.findOne({
      where: { formId: recipe.formId, version: recipe.version },
    });
    if (existing) {
      throw new Error(
        `Recipe with formId "${recipe.formId}" and version "${recipe.version}" already exists`,
      );
    }

    const entity = repo.create({
      formId: recipe.formId,
      version: recipe.version,
      schema: recipe,
      publishedAt: null,
    });
    await repo.save(entity);
  });

export const updateRecipe = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      formId: z.string(),
      recipe: z.unknown(),
    }),
  )
  .handler(async ({ data }): Promise<void> => {
    const recipe = data.recipe as ServiceContractRecipe;
    const ds = await getDataSource();

    const rows = await ds.query<FormDefinitionRow[]>(
      `SELECT id, version, schema, published_at
       FROM form_definitions
       WHERE form_id = $1
       ORDER BY string_to_array(version, '.')::int[] DESC
       LIMIT 1`,
      [data.formId],
    );
    if (!rows.length) {
      throw new Error(`No recipe found for formId: ${data.formId}`);
    }
    const row = rows[0];
    if (row.published_at !== null) {
      throw new Error("Cannot update a published recipe");
    }
    if (recipe.version !== row.version) {
      throw new Error(
        `Version mismatch: stored version is ${row.version}, recipe version is ${recipe.version}`,
      );
    }

    await ds.query(`UPDATE form_definitions SET schema = $1 WHERE id = $2`, [
      recipe,
      row.id,
    ]);
  });

export const nextVersion = createServerFn({ method: "GET" })
  .inputValidator(z.object({ formId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{ currentVersion: string | null; nextVersion: string }> => {
      const ds = await getDataSource();

      const rows = await ds.query<FormDefinitionRow[]>(
        `SELECT id, version, schema, published_at
         FROM form_definitions
         WHERE form_id = $1
         ORDER BY string_to_array(version, '.')::int[] DESC
         LIMIT 1`,
        [data.formId],
      );

      if (!rows.length) {
        return { currentVersion: null, nextVersion: "1.0.0" };
      }

      return {
        currentVersion: rows[0].version,
        nextVersion: bumpMinor(rows[0].version),
      };
    },
  );
