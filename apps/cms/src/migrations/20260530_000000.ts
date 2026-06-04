import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// One-document service model. Drop page_role (entry/start are no longer separate
// docs) and the manual service_type (digital is derived from the start action).
// Add the Start page tab fields: start_type + form_id + start_url + start_body.
// The data fold (folding /start docs into parents) runs via fold-start-pages.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" DROP COLUMN IF EXISTS "page_role";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_page_role";
  ALTER TABLE "services" DROP COLUMN IF EXISTS "service_type";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_service_type";
  DROP TYPE IF EXISTS "public"."enum_services_page_role";
  DROP TYPE IF EXISTS "public"."enum__services_v_version_page_role";
  DROP TYPE IF EXISTS "public"."enum_services_service_type";
  DROP TYPE IF EXISTS "public"."enum__services_v_version_service_type";
  CREATE TYPE "public"."enum_services_start_type" AS ENUM('form', 'link');
  CREATE TYPE "public"."enum__services_v_version_start_type" AS ENUM('form', 'link');
  ALTER TABLE "services" ADD COLUMN "start_type" "enum_services_start_type";
  ALTER TABLE "services" ADD COLUMN "form_id" varchar;
  ALTER TABLE "services" ADD COLUMN "start_url" varchar;
  ALTER TABLE "services" ADD COLUMN "start_body" jsonb;
  ALTER TABLE "_services_v" ADD COLUMN "version_start_type" "enum__services_v_version_start_type";
  ALTER TABLE "_services_v" ADD COLUMN "version_form_id" varchar;
  ALTER TABLE "_services_v" ADD COLUMN "version_start_url" varchar;
  ALTER TABLE "_services_v" ADD COLUMN "version_start_body" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" DROP COLUMN IF EXISTS "start_type";
  ALTER TABLE "services" DROP COLUMN IF EXISTS "form_id";
  ALTER TABLE "services" DROP COLUMN IF EXISTS "start_url";
  ALTER TABLE "services" DROP COLUMN IF EXISTS "start_body";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_start_type";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_form_id";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_start_url";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_start_body";
  DROP TYPE IF EXISTS "public"."enum_services_start_type";
  DROP TYPE IF EXISTS "public"."enum__services_v_version_start_type";
  CREATE TYPE "public"."enum_services_service_type" AS ENUM('digital', 'information');
  ALTER TABLE "services" ADD COLUMN "service_type" "enum_services_service_type" DEFAULT 'information';`)
}
