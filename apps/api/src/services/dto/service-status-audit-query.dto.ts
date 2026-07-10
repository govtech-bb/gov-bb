import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ServiceStatusAuditQueryDto {
  @ApiProperty({
    description: "The slug of the service whose audit history is requested",
    maxLength: 100,
    example: "passport-renewal",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;
}
