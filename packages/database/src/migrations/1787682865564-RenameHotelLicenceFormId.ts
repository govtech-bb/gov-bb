import { MigrationInterface, QueryRunner } from "typeorm";

const OLD_ID = "hotel-licence-application";
const NEW_ID = "apply-for-hotel-licence";

/**
 * Carry the `hotel-licence-application` → `apply-for-hotel-licence` form-id
 * rename through every table that stores a form id.
 *
 * The recipe file and the landing page's `form_id` move in the same commit, but
 * nothing in the schema references a form id by foreign key — every table holds
 * it as a loose `varchar(100)`. So a repo-only rename doesn't cascade: the rows
 * silently orphan under the old id and the form loses the state attached to it.
 * What breaks, concretely:
 *
 *   - `form_config`  — the MDA contact link behind `resolveMdaEmail` /
 *     `resolveDepartmentName`. Orphaned, both return null and MDA notifications
 *     quietly fall back to the default inbox.
 *   - `service_status` / `service_status_audit_log` — keyed by the canonical
 *     service key, which for a form-backed service *is* the form id
 *     (`form_id ?? slug`). Orphaned, the feature-flag toggle stops applying and
 *     the page reverts to its frontmatter default.
 *   - `form_disabled_overrides` — a tombstone under the old id keeps the old id
 *     claimed while leaving the new id un-disabled.
 *   - `form_definitions` — the Form Builder's scratch row. Orphaned, the picker
 *     shows a phantom form under the old id.
 *   - `form_submissions`, `form_drafts`, `payments`, `notification_log` — history
 *     and in-flight state. Orphaned, past submissions no longer resolve to a
 *     form and a citizen's saved-draft resume link dies.
 *
 * The Form Builder's own re-key endpoint (`POST /builder/forms/:formId/rekey`)
 * does this atomically for `form_definitions` + `form_config`, but it refuses
 * published forms with a 409 — so a published form has to be moved here.
 *
 * Every statement is written to be safely re-runnable: the history tables match
 * nothing on a second pass, and each unique/primary-key column is guarded by a
 * `NOT EXISTS` on the destination id. The guard also means a pre-existing row
 * already sitting on the new id (e.g. a draft someone created in the builder)
 * leaves the old row untouched instead of tripping the constraint — a migration
 * that throws here would crash-loop the API on boot, which is a far worse
 * outcome than one orphaned row.
 */
export class RenameHotelLicenceFormId1787682865564 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, OLD_ID, NEW_ID);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await rename(queryRunner, NEW_ID, OLD_ID);
  }
}

/** Tables holding a form id under a UNIQUE or PRIMARY KEY constraint. */
const CONSTRAINED: { table: string; column: string }[] = [
  { table: "form_definitions", column: "form_id" },
  { table: "form_config", column: "form_id" },
  { table: "form_disabled_overrides", column: "form_id" },
  { table: "form_editing_session", column: "form_id" },
  { table: "service_status", column: "slug" },
];

/** Tables holding a form id with no uniqueness constraint. */
const UNCONSTRAINED: { table: string; column: string }[] = [
  { table: "service_status_audit_log", column: "slug" },
  { table: "form_submissions", column: "form_id" },
  { table: "form_drafts", column: "form_id" },
  { table: "payments", column: "form_id" },
  { table: "notification_log", column: "form_id" },
];

async function rename(
  queryRunner: QueryRunner,
  from: string,
  to: string,
): Promise<void> {
  for (const { table, column } of CONSTRAINED) {
    await queryRunner.query(
      `UPDATE "${table}" SET "${column}" = $1
         WHERE "${column}" = $2
           AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t."${column}" = $1)`,
      [to, from],
    );
  }
  for (const { table, column } of UNCONSTRAINED) {
    await queryRunner.query(
      `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`,
      [to, from],
    );
  }
}
