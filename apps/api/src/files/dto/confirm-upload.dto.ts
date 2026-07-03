import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// Matches buildKey output. The (stepId/fieldId) segments are optional so keys
// presigned before the binding change (#284) still validate during rollout:
//   uploads/<formId>/[<stepId>/<fieldId>/]<yyyy>/<mm>/<uuid>-<sanitized>
const KEY_PATTERN =
  /^uploads\/[a-z0-9-]+\/(?:[A-Za-z0-9-]+\/[A-Za-z0-9_-]+\/)?\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]+$/;
// Lowercase-only (no `i` flag): a formId is a canonical lowercase kebab-case id
// (ADR 0028). Rejecting uppercase here matches KEY_PATTERN's lowercase formId
// segment, so an uppercase id can't presign then fail at confirm (#1853).
const FORM_ID_PATTERN = /^[a-z0-9-]+$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/i;
// fieldId is embedded in the S3 key path (#284), so it must be path-safe — no
// "/" or ".." that could escape the prefix. Allows the camelCase recipe field
// ids in use (e.g. "policeCertificate").
const FIELD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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
  @Matches(FIELD_ID_PATTERN)
  fieldId!: string;
}
