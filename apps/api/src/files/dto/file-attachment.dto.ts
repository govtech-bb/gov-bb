import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SCAN_VERDICTS, type ScanVerdict } from "../malware-scan-status";

export class FileAttachmentDto {
  @ApiProperty()
  key!: string;
  @ApiPropertyOptional({
    description: "Signed preview link; present only when scanStatus is clean.",
  })
  url?: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  size!: number;
  @ApiProperty()
  type!: string;
  @ApiProperty({
    enum: SCAN_VERDICTS,
    description:
      "GuardDuty malware verdict. `pending` means the scan hadn't finished within the wait; ask again.",
  })
  scanStatus!: ScanVerdict;
}
