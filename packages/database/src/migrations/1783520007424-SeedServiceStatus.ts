import { MigrationInterface, QueryRunner } from "typeorm";
import { SERVICE_STATUS_SEED_ROWS } from "./service-status-seed.data";

/**
 * One-time seed of `service_status` from the platform's current *static*
 * visibility (#1650). Every existing service gets a row so the #1898 admin UI
 * shows the true state of every service from day one, instead of defaulting
 * no-row services to `enabled`. The rows are generated at authoring time by
 * `scripts/generate-service-status-seed.ts` (committed in
 * `service-status-seed.data.ts`) and applied once per environment by the deploy
 * migrate gate.
 *
 * Insert-only: a slug that already has a row (an admin toggled it before this
 * ran) is left untouched by `ON CONFLICT (slug) DO NOTHING` and gets no audit
 * row. Each newly-inserted row also writes its first audit entry (`old_state`
 * NULL, author `seed:#1650`) in the same statement, so the seed is visible in
 * the audit trail. `id` / `changed_at` come from the column defaults.
 */
export class SeedServiceStatus1783520007424 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { slug, status } of SERVICE_STATUS_SEED_ROWS) {
      await queryRunner.query(
        `WITH seeded AS (
           INSERT INTO service_status (slug, status)
           VALUES ($1, $2::service_status_enum)
           ON CONFLICT (slug) DO NOTHING
           RETURNING slug, status
         )
         INSERT INTO service_status_audit_log (slug, old_state, new_state, author)
         SELECT slug, NULL, status, 'seed:#1650' FROM seeded`,
        [slug, status],
      );
    }
  }

  public async down(): Promise<void> {
    // No-op by design (#1650). Once written, a seeded row is indistinguishable
    // from a later admin toggle, so reverting must not delete rows — doing so
    // could clobber genuine operational state. The seed is applied once and
    // never rolled back.
  }
}
