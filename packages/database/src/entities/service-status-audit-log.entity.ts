import { Column, Entity, Index } from "typeorm";
import { UuidEntity } from "./entity-base";
import { ServiceStatus } from "./service-status.entity";

/**
 * Append-only history of service_status changes. Rows are inserted alongside
 * every state change and never updated.
 */
@Entity({ name: "service_status_audit_log" })
@Index(["formId"])
export class ServiceStatusAuditLogEntity extends UuidEntity {
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  /** The state before the change. Null for a form's first-ever entry. */
  @Column({
    name: "old_state",
    type: "enum",
    enum: ServiceStatus,
    enumName: "service_status_enum",
    nullable: true,
  })
  oldState!: ServiceStatus | null;

  /** The state after the change. */
  @Column({
    name: "new_state",
    type: "enum",
    enum: ServiceStatus,
    enumName: "service_status_enum",
  })
  newState!: ServiceStatus;

  /** Email of the user who authored the change. */
  @Column({ type: "varchar", length: 255 })
  author!: string;

  /** When the change was made. */
  @Column({ name: "changed_at", type: "timestamp", default: () => "NOW()" })
  changedAt!: Date;
}
