import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// Matches buildKey output: uploads/<formId>/<yyyy>/<mm>/<uuid>-<sanitized>
const KEY_PATTERN =
  /^uploads\/[a-z0-9-]+\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]+$/;
const FORM_ID_PATTERN = /^[a-z0-9-]+$/i;
const SLUG_PATTERN = /^[a-z0-9-]+$/i;

export class ConfirmUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(KEY_PATTERN)
  key!: string;

  // formId/formVersion/stepId/fieldId are re-asserted so confirm can verify
  // the actual S3 blob (size + MIME) against the form's policy.
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(FORM_ID_PATTERN)
  formId!: string;

  // Optional post-#1196 (version retired); pre-cutover clients still send it.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  formVersion?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(SLUG_PATTERN)
  stepId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fieldId!: string;
}
