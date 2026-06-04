import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_services_page_role" AS ENUM('entry', 'start');
  CREATE TYPE "public"."enum__services_v_version_page_role" AS ENUM('entry', 'start');
  ALTER TABLE "services" ADD COLUMN "page_role" "enum_services_page_role" DEFAULT 'entry';
  ALTER TABLE "_services_v" ADD COLUMN "version_page_role" "enum__services_v_version_page_role" DEFAULT 'entry';
  UPDATE "services" SET "page_role" = 'start' WHERE "slug" LIKE '%/start';
  UPDATE "_services_v" SET "version_page_role" = 'start' WHERE "version_slug" LIKE '%/start';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" DROP COLUMN IF EXISTS "page_role";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_page_role";
  DROP TYPE "public"."enum_services_page_role";
  DROP TYPE "public"."enum__services_v_version_page_role";`)
}
