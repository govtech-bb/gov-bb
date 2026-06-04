import { ApiProperty } from "@nestjs/swagger";
import { FormSubmissionStatus } from "@govtech-bb/database";

/**
 * Swagger response shape for a form submission. Mirrors FormSubmissionEntity —
 * the persistence entity lives in @govtech-bb/database and stays free of
 * @nestjs/swagger (#721), so the API documents its responses here.
 */
export class FormSubmissionResponseDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "Auto-generated UUID",
  })
  id!: string;

  @ApiProperty({
    example: "req-abc-123",
    maxLength: 255,
    description: "Client-supplied idempotency key",
  })
  idempotencyKey!: string;

  @ApiProperty({
    example: "PR-20260515-104530-A3B7K9",
    maxLength: 64,
    description: "Human-readable submission reference",
  })
  referenceCode!: string;

  @ApiProperty({ example: "passport-renewal", maxLength: 100 })
  formId!: string;

  @ApiProperty({ example: "1.0.0", maxLength: 20 })
  formVersion!: string;

  @ApiProperty({
    enum: FormSubmissionStatus,
    example: FormSubmissionStatus.SUBMITTED,
  })
  status!: FormSubmissionStatus;

  @ApiProperty({
    description: "Step-scoped form field values",
    type: "object",
    additionalProperties: true,
    example: { personalDetails: { firstName: "Jane", surname: "Doe" } },
  })
  values!: Record<string, unknown>;

  @ApiProperty({
    description: "Audit trail and submission metadata",
    type: "object",
    additionalProperties: true,
    nullable: true,
    example: null,
  })
  meta!: Record<string, unknown> | null;

  @ApiProperty({ example: "2026-04-22T10:00:00.000Z", nullable: true })
  submittedAt!: Date | null;

  @ApiProperty({ example: "2026-04-16T09:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-04-16T10:00:00.000Z" })
  updatedAt!: Date;
}
