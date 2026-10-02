import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Drop the platform rows for five superseded Environmental Health form ids,
 * whose recipe files are deleted in this same commit.
 *
 * Each of these was an early, broader-scoped EH service that a purpose-built
 * replacement has since taken over:
 *
 *   food-safety-licence-application            → apply-for-food-business-licence
 *                                                / apply-for-restaurant-licence
 *   register-personal-care-business            → register-hair-beauty-business
 *   register-guest-property-environmental-health → barraks-lodging-environmental-health
 *   swimming-wading-pool-permit                → apply-for-swimming-pool-licence
 *   offensive-matter-permit                    → waste-vehicle-licence-application
 *
 * The last two have no recipe file left to delete. `swimming-wading-pool-permit`
 * was collapsed onto `apply-for-swimming-pool-licence` in #2509, and
 * RenameSwimmingPoolFormId1787769265564 already moved its rows across — so it is
 * listed here only to sweep up anything written under the old id since. Nothing
 * was ever committed under `offensive-matter-permit`; if the Form Builder left
 * rows behind for it, this removes them. Both are expected to be no-ops.
 *
 * The replacement ids above are the ones current when this migration was
 * written; RenameEnvironmentalHealthFormIds1788028465564 runs after it and
 * renames three of them (register-hair-beauty-business,
 * barraks-lodging-environmental-health and waste-vehicle-licence-application).
 * None of the five ids deleted here appear in that rename list.
 *
 * Nothing in the schema references a form id by foreign key — every table holds
 * it as a loose `varchar(100)` — so the rows do not go anywhere when the recipe
 * files do, and each one left behind is a silent orphan: a `form_config` row
 * keeps an MDA contact bound to a form that no longer exists, a `service_status`
 * row keeps advertising it to the status API, and a `form_editing_session` row
 * keeps its Form Builder lock alive forever.
 *
 * Submission history is deliberately left alone. `form_submissions`,
 * `form_drafts`, `payments` and `notification_log` all hold citizen-entered
 * data or a record of what was sent on their behalf; retiring a service is not
 * a reason to destroy it, and none of those rows are read through the form
 * definition, so they orphan harmlessly.
 */
export class DeleteSupersededEnvironmentalHealthForms1787942065564 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of TABLES) {
      await queryRunner.query(
        `DELETE FROM "${table}" WHERE "${column}" = ANY($1)`,
        [FORM_IDS],
      );
    }
  }

  /**
   * Irreversible. A delete keeps nothing to put back, and these rows are not
   * reconstructible from the recipe files — `form_config` holds a hand-made MDA
   * contact link, `service_status` holds operator-set availability. Restoring
   * them means re-adding the recipes and re-seeding through the normal paths,
   * not running a `down()`.
   */
  public async down(): Promise<void> {
    // Intentionally empty — see above.
  }
}

const FORM_IDS = [
  "food-safety-licence-application",
  "register-personal-care-business",
  "register-guest-property-environmental-health",
  "swimming-wading-pool-permit",
  "offensive-matter-permit",
];

/**
 * The tables that define a form to the platform. Deliberately excludes the four
 * tables holding submission history — see the class doc comment.
 */
const TABLES: { table: string; column: string }[] = [
  { table: "form_definitions", column: "form_id" },
  { table: "form_config", column: "form_id" },
  { table: "form_disabled_overrides", column: "form_id" },
  { table: "form_editing_session", column: "form_id" },
  { table: "service_status", column: "slug" },
  { table: "service_status_audit_log", column: "slug" },
];
