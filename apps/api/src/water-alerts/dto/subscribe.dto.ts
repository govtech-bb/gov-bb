import { IsEmail, IsIn, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PARISHES } from "../parishes";

// Accepted `area` values: "" (or "all") = all of Barbados, else a parish slug.
export const SUBSCRIBE_AREA_VALUES: string[] = [
  "",
  "all",
  ...PARISHES.map((p) => p.value),
];

export class SubscribeDto {
  @ApiProperty({ description: "Subscriber email address" })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Area to watch: "" / "all" for all of Barbados, else a parish slug',
    required: false,
    default: "all",
  })
  @IsOptional()
  @IsIn(SUBSCRIBE_AREA_VALUES)
  area?: string;
}
