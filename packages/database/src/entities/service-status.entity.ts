import { Column, Entity, Index } from "typeorm";
import { UuidEntity } from "./entity-base";

export enum ServiceStatus {
  /** Service fully live: landing page visible, form reachable. */
  ENABLED = "enabled",
  /** Service page stays visible, but the form itself is unreachable. */
  FORM_DISABLED = "form_disabled",
  /**
   * The whole service is hidden from the public — viewable only with the
   * preview token/cookie.
   */
  DISABLED = "disabled",
}

/**
 * Database-driven visibility state for a service. One row per `formId`
 * (unique); a form with no row is left to the consuming app layer's default.
 * State changes are recorded in service_status_audit_log.
 */
@Entity({ name: "service_status" })
@Index(["formId"], { unique: true })
export class ServiceStatusEntity extends UuidEntity {
  /** The form this status belongs to. Unique — one status row per form. */
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @Column({
    type: "enum",
    enum: ServiceStatus,
    enumName: "service_status_enum",
    default: ServiceStatus.ENABLED,
  })
  status!: ServiceStatus;
}
