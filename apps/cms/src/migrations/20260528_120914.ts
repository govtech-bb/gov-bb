import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_services_flag" AS ENUM('live', 'flagged');
  CREATE TYPE "public"."enum__services_v_version_flag" AS ENUM('live', 'flagged');
  CREATE TYPE "public"."enum_organisations_flag" AS ENUM('live', 'flagged');
  CREATE TYPE "public"."enum__organisations_v_version_flag" AS ENUM('live', 'flagged');
  ALTER TABLE "services" ADD COLUMN "flag" "enum_services_flag" DEFAULT 'live';
  ALTER TABLE "_services_v" ADD COLUMN "version_flag" "enum__services_v_version_flag" DEFAULT 'live';
  ALTER TABLE "organisations" ADD COLUMN "flag" "enum_organisations_flag" DEFAULT 'live';
  ALTER TABLE "_organisations_v" ADD COLUMN "version_flag" "enum__organisations_v_version_flag" DEFAULT 'live';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" DROP COLUMN IF EXISTS "flag";
  ALTER TABLE "_services_v" DROP COLUMN IF EXISTS "version_flag";
  ALTER TABLE "organisations" DROP COLUMN IF EXISTS "flag";
  ALTER TABLE "_organisations_v" DROP COLUMN IF EXISTS "version_flag";
  DROP TYPE "public"."enum_services_flag";
  DROP TYPE "public"."enum__services_v_version_flag";
  DROP TYPE "public"."enum_organisations_flag";
  DROP TYPE "public"."enum__organisations_v_version_flag";`)
}
