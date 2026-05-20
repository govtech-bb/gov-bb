import { Column, Entity } from "typeorm";
import { TimestampedEntity } from "./entity-base";

export enum DraftStatus {
  ACTIVE = "active",
  ABANDONED = "abandoned",
}

@Entity({ name: "form_drafts" })
export class FormDraftEntity extends TimestampedEntity {
  @Column({ name: "draft_id", type: "varchar", length: 100, unique: true })
  draftId!: string;

  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @Column({ name: "form_version", type: "varchar", length: 20 })
  formVersion!: string;

  @Column({ type: "jsonb", default: {} })
  values!: Record<string, unknown>;

  @Column({ name: "last_active_page", type: "int", default: 0 })
  lastActivePage!: number;

  @Column({
    type: "enum",
    enum: DraftStatus,
    enumName: "form_drafts_status_enum",
    default: DraftStatus.ACTIVE,
  })
  status!: DraftStatus;

  @Column({ name: "last_active_at", type: "timestamp", default: () => "NOW()" })
  lastActiveAt!: Date;
}
