import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class DisableFormDto {
  @ApiProperty({
    description: "Operator-provided reason for disabling the form.",
    maxLength: 2000,
    example: "Step 3 is producing 500s — disabling pending fix.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({
    description:
      "Identifier of the person disabling the form (e.g. email or GitHub login). " +
      "Will be replaced by the authenticated principal once #11 lands.",
    maxLength: 255,
    example: "alice@govtech.bb",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  disabledBy!: string;
}
