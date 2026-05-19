import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FormDefinitionEntity } from "@govtech-bb/database";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";
import { getDataSource } from "./db";
import { bumpMinor } from "../lib/version";
import type { FormDefinitionSummary } from "../types/index";

export const listForms = createServerFn({ method: "GET" }).handler(
  async (): Promise<FormDefinitionSummary[]> => {
    const ds = await getDataSource();
    const rows = await ds.query<
      { id: string; form_id: string; title: string; version: string }[]
    >(`
      SELECT DISTINCT ON (form_id) id, form_id, schema->>'title' AS title, version
      FROM form_definitions
      ORDER BY form_id, string_to_array(version, '.')::int[] DESC
    `);
    return rows.map((r) => ({
      id: r.id,
      formId: r.form_id,
      title: r.title,
      version: r.version,
    }));
  },
);

export const getRecipe = createServerFn({ method: "GET", strict: false })
  .inputValidator(z.object({ formId: z.string() }))
  .handler(async ({ data }): Promise<ServiceContractRecipe> => {
    const ds = await getDataSource();
    const repo = ds.getRepository(FormDefinitionEntity);
    const entity = await repo.findOne({
      where: { formId: data.formId },
      order: { version: "DESC" },
    });
    if (!entity) {
      throw new Error(`No recipe found for formId: ${data.formId}`);
    }
    return entity.schema;
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
    const repo = ds.getRepository(FormDefinitionEntity);

    const entity = await repo.findOne({
      where: { formId: data.formId },
      order: { version: "DESC" },
    });
    if (!entity) {
      throw new Error(`No recipe found for formId: ${data.formId}`);
    }
    if (entity.publishedAt !== null) {
      throw new Error("Cannot update a published recipe");
    }

    entity.schema = recipe;
    await repo.save(entity);
  });

export const nextVersion = createServerFn({ method: "GET" })
  .inputValidator(z.object({ formId: z.string() }))
  .handler(
    async ({
      data,
    }): Promise<{ currentVersion: string | null; nextVersion: string }> => {
      const ds = await getDataSource();
      const repo = ds.getRepository(FormDefinitionEntity);

      const entity = await repo.findOne({
        where: { formId: data.formId },
        order: { version: "DESC" },
      });

      if (!entity) {
        return { currentVersion: null, nextVersion: "1.0.0" };
      }

      return {
        currentVersion: entity.version,
        nextVersion: bumpMinor(entity.version),
      };
    },
  );
