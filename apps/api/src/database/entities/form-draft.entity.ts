import { Column, Entity } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { TimestampedEntity } from "./entity-base";

export enum DraftStatus {
  ACTIVE = "active",
  ABANDONED = "abandoned",
}

@Entity({ name: "form_drafts" })
export class FormDraftEntity extends TimestampedEntity {
  @ApiProperty({ example: "user-123-passport-draft", maxLength: 100 })
  @Column({ name: "draft_id", type: "varchar", length: 100, unique: true })
  draftId!: string;

  @ApiProperty({ example: "passport-renewal", maxLength: 100 })
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @ApiProperty({ example: "1.0.0", maxLength: 20 })
  @Column({ name: "form_version", type: "varchar", length: 20 })
  formVersion!: string;

  @ApiProperty({
    description: "Stored field values for the draft",
    type: "object",
    additionalProperties: true,
    example: { firstName: "Jane", surname: "Doe" },
  })
  @Column({ type: "jsonb", default: {} })
  values!: Record<string, unknown>;

  @ApiProperty({ description: "Zero-based index of the last active page", example: 2, minimum: 0 })
  @Column({ name: "last_active_page", type: "int", default: 0 })
  lastActivePage!: number;

  @ApiProperty({ enum: DraftStatus, example: DraftStatus.ACTIVE })
  @Column({
    type: "enum",
    enum: DraftStatus,
    enumName: "form_drafts_status_enum",
    default: DraftStatus.ACTIVE,
  })
  status!: DraftStatus;

  @ApiProperty({ example: "2026-04-16T10:00:00.000Z" })
  @Column({ name: "last_active_at", type: "timestamp", default: () => "NOW()" })
  lastActiveAt!: Date;
}
