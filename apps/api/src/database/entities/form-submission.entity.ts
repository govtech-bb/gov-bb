import { Column, Entity } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { TimestampedEntity } from "./entity-base";

export enum FormSubmissionStatus {
  DRAFT = "draft",
  SUBMITTED = "submitted",
  PROCESSING = "processing",
  COMPLETE = "complete",
  ERROR = "error",
}

@Entity({ name: "form_submissions" })
export class FormSubmissionEntity extends TimestampedEntity {
  @ApiProperty({
    example: "req-abc-123",
    maxLength: 255,
    description: "Client-supplied idempotency key",
  })
  @Column({
    name: "idempotency_key",
    type: "varchar",
    length: 255,
    unique: true,
  })
  idempotencyKey!: string;

  @ApiProperty({ example: "passport-renewal", maxLength: 100 })
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @ApiProperty({ example: "1.0.0", maxLength: 20 })
  @Column({ name: "form_version", type: "varchar", length: 20 })
  formVersion!: string;

  @ApiProperty({
    enum: FormSubmissionStatus,
    example: FormSubmissionStatus.SUBMITTED,
  })
  @Column({
    type: "enum",
    enum: FormSubmissionStatus,
    enumName: "form_submissions_status_enum",
  })
  status!: FormSubmissionStatus;

  @ApiProperty({
    description: "Step-scoped form field values",
    type: "object",
    additionalProperties: true,
    example: { personalDetails: { firstName: "Jane", surname: "Doe" } },
  })
  @Column({ type: "jsonb" })
  values!: Record<string, unknown>;

  @ApiProperty({
    description: "Audit trail and submission metadata",
    type: "object",
    additionalProperties: true,
    nullable: true,
    example: null,
  })
  @Column({ type: "jsonb", nullable: true })
  meta!: Record<string, unknown> | null;

  @ApiProperty({ example: "2026-04-22T10:00:00.000Z", nullable: true })
  @Column({ name: "submitted_at", type: "timestamp", nullable: true })
  submittedAt!: Date | null;
}
