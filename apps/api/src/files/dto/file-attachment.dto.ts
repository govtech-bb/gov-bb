import { ApiProperty } from "@nestjs/swagger";

export class FileAttachmentDto {
  @ApiProperty()
  key!: string;
  @ApiProperty()
  url!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  size!: number;
  @ApiProperty()
  type!: string;
}
