import { ApiProperty } from "@nestjs/swagger";
import { DraftStatus } from "@govtech-bb/database";

/**
 * Swagger response shape for a form draft. Mirrors FormDraftEntity — the
 * persistence entity lives in @govtech-bb/database and stays free of
 * @nestjs/swagger (#721), so the API documents its responses here.
 */
export class FormDraftResponseDto {
  @ApiProperty({
    example: "550e8400-e29b-41d4-a716-446655440000",
    description: "Auto-generated UUID",
  })
  id!: string;

  @ApiProperty({ example: "user-123-passport-draft", maxLength: 100 })
  draftId!: string;

  @ApiProperty({ example: "passport-renewal", maxLength: 100 })
  formId!: string;

  @ApiProperty({ example: "1.0.0", maxLength: 20 })
  formVersion!: string;

  @ApiProperty({
    description: "Stored field values for the draft",
    type: "object",
    additionalProperties: true,
    example: { firstName: "Jane", surname: "Doe" },
  })
  values!: Record<string, unknown>;

  @ApiProperty({
    description: "Zero-based index of the last active page",
    example: 2,
    minimum: 0,
  })
  lastActivePage!: number;

  @ApiProperty({ enum: DraftStatus, example: DraftStatus.ACTIVE })
  status!: DraftStatus;

  @ApiProperty({ example: "2026-04-16T10:00:00.000Z" })
  lastActiveAt!: Date;

  @ApiProperty({ example: "2026-04-16T09:00:00.000Z" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-04-16T10:00:00.000Z" })
  updatedAt!: Date;
}
