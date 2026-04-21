import { IsInt, IsObject, IsOptional, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateFormDraftDto {
  @ApiProperty({
    description: "Partial field values to merge into the draft. Existing keys not included are preserved.",
    type: "object",
    additionalProperties: true,
    example: { firstName: "John" },
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiProperty({
    description: "The page index the user is currently on (zero-based)",
    minimum: 0,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  lastActivePage?: number;
}
