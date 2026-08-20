import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves the per-catchment Environmental Health inboxes out of the committed
 * `POLYCLINIC_EMAILS` map and into `catchment_contact`, so rotating a Ministry
 * address is an UPDATE in one environment rather than a code change and a
 * deploy across all of them.
 *
 * Seeded with the seven **serving** catchments on the shared test inbox — the
 * exact addresses the map held — so behaviour is unchanged everywhere the
 * moment this runs. Frederick Miller is served by St. Philip and deliberately
 * gets no row: an inbox nothing can route to is worse than none.
 *
 * Every statement is idempotent. A git revert never runs `down()`, so a
 * reverted-then-relanded migration meets its own table and rows again — a bare
 * CREATE/INSERT would fail on boot and crash-loop the API, which is exactly how
 * the `ministry_key` re-land broke. `ON CONFLICT DO NOTHING` also means the
 * seed can never clobber a real address an environment has already set.
 */
export class CreateCatchmentContact1785500000000 implements MigrationInterface {
  private static readonly SERVING_CATCHMENTS = [
    "Branford Taitt Polyclinic",
    "David Thompson Health & Social Services Complex",
    "Eunice Gibson Polyclinic",
    "Maurice Byer Polyclinic",
    "Randal Phillips Polyclinic",
    "Sir Winston Scott Polyclinic",
    "St. Philip Polyclinic",
  ];

  /** The inbox every catchment starts on — same value the map shipped. */
  private static readonly SEED_EMAIL = "testing@govtech.bb";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catchment_contact" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "catchment_name" varchar(100) NOT NULL,
        "mda_email" varchar(255) NOT NULL
      )
    `);

    // Unique so the send-time lookup can never be ambiguous — and so the seed
    // below has a conflict target to be idempotent against.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ix_catchment_contact_catchment_name"
       ON "catchment_contact" ("catchment_name")`,
    );

    for (const name of CreateCatchmentContact1785500000000.SERVING_CATCHMENTS) {
      await queryRunner.query(
        `INSERT INTO "catchment_contact" ("catchment_name", "mda_email")
         VALUES ($1, $2)
         ON CONFLICT ("catchment_name") DO NOTHING`,
        [name, CreateCatchmentContact1785500000000.SEED_EMAIL],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "catchment_contact"`);
  }
}
