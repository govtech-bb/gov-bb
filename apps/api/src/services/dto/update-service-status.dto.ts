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

  // `author` is NOT accepted from the request body — it is the GitHub login
  // verified by GitHubAuthGuard (see the controller), so it can't be spoofed.
}
