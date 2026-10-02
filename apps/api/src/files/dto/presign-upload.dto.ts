import {
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// Lowercase-only (no `i` flag): a formId is a canonical lowercase kebab-case id
// (ADR 0028). Rejecting uppercase at presign keeps it consistent with confirm's
// KEY_PATTERN, so an uppercase id can't presign then fail at confirm (#1853).
const FORM_ID_PATTERN = /^[a-z0-9-]+$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/i;
// fieldId is embedded in the S3 key path (#284), so it must be path-safe — no
// "/" or ".." that could escape the prefix. Allows camelCase recipe field ids.
const FIELD_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class PresignUploadDto {
  @ApiProperty({ example: "passport-renewal" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(FORM_ID_PATTERN)
  formId!: string;

  // Optional post-#1196 (version retired): present → legacy file lookup,
  // absent → canonical recipe. Pre-cutover clients still send it.
  @ApiProperty({ example: "1.0.0", required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  formVersion?: string;

  @ApiProperty({ example: "documents" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(SLUG_PATTERN)
  stepId!: string;

  @ApiProperty({ example: "policeCertificate" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(FIELD_ID_PATTERN)
  fieldId!: string;

  @ApiProperty({ example: "police-cert.pdf" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ example: "application/pdf" })
  @IsMimeType()
  contentType!: string;

  @ApiProperty({ example: 524288 })
  @IsInt()
  @Min(1)
  size!: number;
}

export class PresignUploadResponseDto {
  @ApiProperty()
  uploadUrl!: string;
  @ApiProperty()
  key!: string;
  @ApiProperty()
  expiresIn!: number;
  @ApiProperty()
  maxSize!: number;
}
