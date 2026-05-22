import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";

@Entity({ name: "form_disabled_overrides" })
export class FormDisabledOverrideEntity {
  @ApiProperty({ example: "passport-renewal" })
  @PrimaryColumn({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @ApiProperty({ example: "Step 3 is producing 500s — disabling pending fix." })
  @Column({ type: "text" })
  reason!: string;

  @ApiProperty({ example: "alice@govtech.bb" })
  @Column({ name: "disabled_by", type: "varchar", length: 255 })
  disabledBy!: string;

  @ApiProperty({ example: "2026-05-22T09:00:00.000Z" })
  @CreateDateColumn({
    name: "disabled_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  disabledAt!: Date;
}
