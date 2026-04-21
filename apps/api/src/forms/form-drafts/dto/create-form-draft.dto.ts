import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateFormDraftDto {
  @ApiProperty({
    description: "Unique identifier for the draft, chosen by the client",
    maxLength: 100,
    example: "user-123-passport-draft",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  draftId!: string;

  @ApiProperty({
    description: "The ID of the form this draft belongs to",
    maxLength: 100,
    example: "passport-renewal",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  formId!: string;

  @ApiProperty({
    description: "Pin the draft to a specific form version. Defaults to the latest version.",
    maxLength: 20,
    example: "1.0.0",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @ApiProperty({
    description: "Initial field values to seed the draft with",
    type: "object",
    additionalProperties: true,
    example: { firstName: "Jane", surname: "Doe" },
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiProperty({
    description: "The page index the user was last on (zero-based)",
    minimum: 0,
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  lastActivePage?: number;
}
