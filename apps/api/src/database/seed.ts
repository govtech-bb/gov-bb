import { DataSource } from "typeorm";
import { FormDefinitionEntity } from "./entities/form-definition.entity";

/**
 * Seed data for local development. Inserted on api boot when
 * SEED_ON_BOOT=true (set in docker-compose.yml; unset everywhere else, so
 * production deploys never trigger this).
 *
 * Each row is idempotent — keyed by (formId, version). Re-running the seed
 * against an already-seeded database is a no-op.
 *
 * To add more example forms: append a new entry to seedFormDefinitions
 * below. Keep them small so the seed stays fast on cold container starts.
 */

const exampleSeed = {
  formId: "example-name-change",
  version: "1.0.0",
  schema: {
    formId: "example-name-change",
    title: "Change your name",
    description:
      "Example seed form. Demonstrates the FormDefinition shape so the api responds usefully right after `docker compose up`.",
    version: "1.0.0",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:00.000Z",
    contactDetails: {
      title: "Civil Registry",
      telephoneNumber: "(246) 535-0000",
      email: "info@registry.gov.bb",
      address: {
        line1: "Coleridge Street",
        city: "Bridgetown",
        country: "Barbados",
      },
    },
    steps: [
      {
        stepId: "applicant",
        title: "Your details",
        description: "Confirm who is making this change.",
        elements: [
          {
            fieldId: "current-first-name",
            label: "Current first name",
            htmlType: "text",
            validations: {
              required: {
                value: true,
                error: "Current first name is required",
              },
            },
            metadata: { pii: true, sensitive: false },
            ui: { width: "medium" },
          },
          {
            fieldId: "current-surname",
            label: "Current surname",
            htmlType: "text",
            validations: {
              required: { value: true, error: "Current surname is required" },
            },
            metadata: { pii: true, sensitive: false },
            ui: { width: "medium" },
          },
        ],
      },
      {
        stepId: "new-name",
        title: "New name",
        description: "What would you like to change your name to?",
        elements: [
          {
            fieldId: "new-first-name",
            label: "New first name",
            htmlType: "text",
            validations: {
              required: { value: true, error: "New first name is required" },
            },
            metadata: { pii: true, sensitive: false },
            ui: { width: "medium" },
          },
        ],
      },
    ],
  },
};

const seedFormDefinitions = [exampleSeed];

export async function runSeed(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(FormDefinitionEntity);
  const now = new Date();

  for (const def of seedFormDefinitions) {
    const existing = await repo.findOne({
      where: { formId: def.formId, version: def.version },
    });
    if (existing) continue;

    await repo.save(
      repo.create({
        formId: def.formId,
        version: def.version,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: def.schema as any,
        publishedAt: now,
      }),
    );
  }
}
