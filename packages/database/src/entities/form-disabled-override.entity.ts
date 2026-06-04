import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "form_disabled_overrides" })
export class FormDisabledOverrideEntity {
  /** The form being force-disabled. One override row per form. */
  @PrimaryColumn({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  /** Operator-facing reason the form was disabled. */
  @Column({ type: "text" })
  reason!: string;

  /** Who disabled it. */
  @Column({ name: "disabled_by", type: "varchar", length: 255 })
  disabledBy!: string;

  @CreateDateColumn({
    name: "disabled_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  disabledAt!: Date;
}
