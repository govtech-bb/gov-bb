/**
 * Seed script — inserts sample form_definitions and form_drafts for local testing.
 * Run from project root:
 *   TS_NODE_PROJECT=apps/api/tsconfig.json npx ts-node apps/api/src/database/seed.ts
 */
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';

dotenv.config({ path: resolve(process.cwd(), 'apps/api/src/.env') });

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'modular_forms',
  synchronize: false,
  logging: false,
  entities: [],
  migrations: [],
});

// ── Form definition schemas ───────────────────────────────────────────────────

const passportRenewalV1 = {
  formId: 'passport-renewal',
  title: 'Passport Renewal',
  description: 'Renew your Barbados passport',
  version: '1.0.0',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  steps: [
    {
      stepId: 'personal-details',
      title: 'Personal Details',
      description: 'Tell us about yourself',
      elements: [
        { ref: 'blocks/personal-information' },
      ],
    },
    {
      stepId: 'contact',
      title: 'Contact Information',
      elements: [
        { ref: 'blocks/contact-information' },
      ],
    },
    {
      stepId: 'documents',
      title: 'Supporting Documents',
      elements: [
        { ref: 'blocks/supporting-documents' },
      ],
    },
    {
      stepId: 'declaration',
      title: 'Declaration',
      elements: [
        { ref: 'blocks/applicant-declaration' },
      ],
    },
  ],
  processors: [],
};

const passportRenewalV2 = {
  ...passportRenewalV1,
  version: '2.0.0',
  description: 'Renew your Barbados passport (updated form)',
  updatedAt: new Date('2026-02-15'),
  steps: [
    ...passportRenewalV1.steps,
    {
      stepId: 'additional-info',
      title: 'Additional Information',
      elements: [
        { ref: 'blocks/additional-information' },
      ],
    },
  ],
};

const driverLicenceV1 = {
  formId: 'driver-licence-renewal',
  title: "Driver's Licence Renewal",
  description: "Renew your Barbados driver's licence",
  version: '1.0.0',
  createdAt: new Date('2026-01-10'),
  updatedAt: new Date('2026-01-10'),
  steps: [
    {
      stepId: 'personal-details',
      title: 'Personal Details',
      elements: [
        { ref: 'blocks/personal-information' },
      ],
    },
    {
      stepId: 'address',
      title: 'Physical Address',
      elements: [
        { ref: 'blocks/physical-address' },
      ],
    },
    {
      stepId: 'documents',
      title: 'Supporting Documents',
      elements: [
        { ref: 'blocks/supporting-documents' },
      ],
    },
  ],
  processors: [],
};

const nationalIdV1 = {
  formId: 'national-id-application',
  title: 'National ID Application',
  description: 'Apply for a Barbados National ID card',
  version: '1.0.0',
  createdAt: new Date('2026-01-20'),
  updatedAt: new Date('2026-01-20'),
  steps: [
    {
      stepId: 'identity',
      title: 'Prove Your Identity',
      elements: [
        { ref: 'blocks/proving-your-identity' },
      ],
    },
    {
      stepId: 'personal-details',
      title: 'Personal Details',
      elements: [
        { ref: 'blocks/personal-information' },
      ],
    },
    {
      stepId: 'contact',
      title: 'Contact Information',
      elements: [
        { ref: 'blocks/contact-information' },
      ],
    },
    {
      stepId: 'declaration',
      title: 'Declaration',
      elements: [
        { ref: 'blocks/applicant-declaration' },
      ],
    },
  ],
  processors: [],
};

// ── Seed helper ───────────────────────────────────────────────────────────────

async function upsertFormDef(
  db: DataSource,
  schema: typeof passportRenewalV1,
): Promise<string> {
  const existing = await db.query(
    `SELECT id FROM form_definitions WHERE form_id = $1 AND version = $2`,
    [schema.formId, schema.version],
  );
  if (existing.length > 0) {
    console.log(`  skip  form_definitions  ${schema.formId}@${schema.version}  (exists)`);
    return existing[0].id as string;
  }
  const [row] = await db.query(
    `INSERT INTO form_definitions (form_id, version, schema, published_at, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW(), $4, $5)
     RETURNING id`,
    [schema.formId, schema.version, JSON.stringify(schema), schema.createdAt, schema.updatedAt],
  );
  console.log(`  insert form_definitions  ${schema.formId}@${schema.version}  id=${row.id}`);
  return row.id as string;
}

async function upsertDraft(
  db: DataSource,
  draft: {
    draftId: string;
    formId: string;
    formVersion: string;
    values: Record<string, unknown>;
    lastActivePage: number;
    status: 'active' | 'abandoned';
  },
): Promise<void> {
  const existing = await db.query(
    `SELECT id FROM form_drafts WHERE draft_id = $1`,
    [draft.draftId],
  );
  if (existing.length > 0) {
    console.log(`  skip  form_drafts       ${draft.draftId}  (exists)`);
    return;
  }
  await db.query(
    `INSERT INTO form_drafts (draft_id, form_id, form_version, values, last_active_page, status, last_active_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW(), NOW())`,
    [draft.draftId, draft.formId, draft.formVersion, JSON.stringify(draft.values), draft.lastActivePage, draft.status],
  );
  console.log(`  insert form_drafts       ${draft.draftId}  (${draft.status})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  await ds.initialize();
  console.log('\n── Form Definitions ───────────────────────────────');

  await upsertFormDef(ds, passportRenewalV1);
  await upsertFormDef(ds, passportRenewalV2);
  await upsertFormDef(ds, driverLicenceV1);
  await upsertFormDef(ds, nationalIdV1);

  console.log('\n── Form Drafts ────────────────────────────────────');

  // Draft at page 0 — just started
  await upsertDraft(ds, {
    draftId: 'draft-passport-new',
    formId: 'passport-renewal',
    formVersion: '2.0.0',
    values: {},
    lastActivePage: 0,
    status: 'active',
  });

  // Draft mid-way through — page 1 with some values saved
  await upsertDraft(ds, {
    draftId: 'draft-passport-in-progress',
    formId: 'passport-renewal',
    formVersion: '1.0.0',
    values: {
      'title': 'Mr',
      'first-name': 'John',
      'middle-name': 'Anthony',
      'last-name': 'Doe',
      'date-of-birth': '1985-06-15',
      'sex': 'M',
      'nationality': 'Barbadian',
      'national-id-number': 'BB-1234567',
    },
    lastActivePage: 1,
    status: 'active',
  });

  // Draft nearly complete — page 3
  await upsertDraft(ds, {
    draftId: 'draft-passport-almost-done',
    formId: 'passport-renewal',
    formVersion: '1.0.0',
    values: {
      'title': 'Ms',
      'first-name': 'Jane',
      'last-name': 'Smith',
      'date-of-birth': '1992-03-22',
      'sex': 'F',
      'nationality': 'Barbadian',
      'national-id-number': 'BB-7654321',
      'email': 'jane.smith@example.com',
      'contact-number': '+12465551234',
    },
    lastActivePage: 3,
    status: 'active',
  });

  // Abandoned draft
  await upsertDraft(ds, {
    draftId: 'draft-passport-abandoned',
    formId: 'passport-renewal',
    formVersion: '1.0.0',
    values: { 'first-name': 'Old', 'last-name': 'User' },
    lastActivePage: 0,
    status: 'abandoned',
  });

  // Driver licence draft
  await upsertDraft(ds, {
    draftId: 'draft-licence-in-progress',
    formId: 'driver-licence-renewal',
    formVersion: '1.0.0',
    values: {
      'first-name': 'Michael',
      'last-name': 'Clarke',
      'date-of-birth': '1978-11-05',
      'national-id-number': 'BB-9876543',
    },
    lastActivePage: 1,
    status: 'active',
  });

  // National ID draft
  await upsertDraft(ds, {
    draftId: 'draft-national-id-new',
    formId: 'national-id-application',
    formVersion: '1.0.0',
    values: {},
    lastActivePage: 0,
    status: 'active',
  });

  console.log('\n── Done ───────────────────────────────────────────\n');
  await ds.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
