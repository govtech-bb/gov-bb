import { Column, Entity } from "typeorm";
import { TimestampedEntity } from "./entity-base";

export enum FormSubmissionStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  PENDING_PAYMENT = "pending_payment",
  PROCESSING = "processing",
  COMPLETE = "complete",
  ERROR = "error",
}

@Entity({ name: "form_submissions" })
export class FormSubmissionEntity extends TimestampedEntity {
  @Column({
    name: "idempotency_key",
    type: "varchar",
    length: 255,
    unique: true,
  })
  idempotencyKey!: string;

  /** Human-readable submission reference (e.g. PR-20260515-104530-A3B7K9). */
  @Column({
    name: "reference_code",
    type: "varchar",
    length: 64,
    unique: true,
  })
  referenceCode!: string;

  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @Column({ name: "form_version", type: "varchar", length: 20 })
  formVersion!: string;

  @Column({
    type: "enum",
    enum: FormSubmissionStatus,
    enumName: "form_submissions_status_enum",
  })
  status!: FormSubmissionStatus;

  @Column({ type: "jsonb" })
  values!: Record<string, unknown>;

  @Column({ type: "jsonb", nullable: true })
  meta!: Record<string, unknown> | null;

  @Column({ name: "submitted_at", type: "timestamp", nullable: true })
  submittedAt!: Date | null;
}
