import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { ServiceStatus } from "@/database/entities/service-status.entity";

export class UpdateServiceStatusDto {
  @ApiProperty({
    description: "The slug of the service whose status is being set",
    maxLength: 100,
    example: "passport-renewal",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug!: string;

  @ApiProperty({
    description: "The status to set the service to",
    enum: ServiceStatus,
    example: ServiceStatus.DISABLED,
  })
  @IsEnum(ServiceStatus)
  status!: ServiceStatus;

  @ApiProperty({
    description:
      "Email of the user making the change (recorded in the audit log)",
    maxLength: 255,
    example: "admin@govtech.bb",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  author!: string;
}
