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

  // Nullable post-#1196: a submission resolving the canonical recipe has no
  // pinned version. Retained as an audit breadcrumb (see migration M1).
  @Column({ name: "form_version", type: "varchar", length: 20, nullable: true })
  formVersion!: string | null;

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

  // Processor entries (snapshot indices) that failed to dispatch async. Null =
  // all entries dispatched (or none ran); a non-empty array marks the indices a
  // reconciliation/retry job should re-dispatch (#1747).
  @Column({ name: "processors_failed", type: "jsonb", nullable: true })
  processorsFailed!: number[] | null;
}
