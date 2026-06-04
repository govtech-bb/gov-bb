import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" ALTER COLUMN "service_type" SET DEFAULT 'information';
  ALTER TABLE "_services_v" ALTER COLUMN "version_service_type" SET DEFAULT 'information';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services" ALTER COLUMN "service_type" DROP DEFAULT;
  ALTER TABLE "_services_v" ALTER COLUMN "version_service_type" DROP DEFAULT;`)
}
