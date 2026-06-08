import { Column, Entity, Index } from "typeorm";
import { UuidEntity } from "./entity-base";

/**
 * A single-editor claim on a form in the builder. One row per `formId`
 * (unique), held by the first person to open the form. A second opener whose
 * poll/claim sees a *fresh* row goes read-only; a row is "fresh" while
 * `lastActivityAt > now() - 15 minutes` and stale otherwise.
 *
 * Stale rows are ignored on read and overwritable on claim, so an editor who
 * walked away or closed the tab cannot hold the form indefinitely — the
 * 15-minute inactivity TTL is the guarantee; eager release on leave is only a
 * best-effort optimisation.
 *
 * `claimedAt` is when the current holder first took the claim; `lastActivityAt`
 * is bumped by every heartbeat and draft mutation and is what freshness is
 * measured against.
 */
@Entity({ name: "form_editing_session" })
@Index(["formId"], { unique: true })
export class FormEditingSessionEntity extends UuidEntity {
  /** The form this claim belongs to. Unique — one claim row per form. */
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  /** GitHub login of the current holder, stamped from the SSR session. */
  @Column({ name: "user_login", type: "varchar", length: 255 })
  userLogin!: string;

  /** When the current holder first took the claim. */
  @Column({ name: "claimed_at", type: "timestamp", default: () => "NOW()" })
  claimedAt!: Date;

  /** Bumped by each heartbeat / draft mutation; freshness is measured here. */
  @Column({
    name: "last_activity_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  lastActivityAt!: Date;
}
