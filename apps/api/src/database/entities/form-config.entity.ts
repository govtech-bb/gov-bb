import { Column, Entity, Index } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { TimestampedEntity } from "./entity-base";

/**
 * Per-form, per-environment configuration. Lives in the DB only (never in the
 * committed recipe), so production and sandbox resolve different values for the
 * same form: sandbox has no row and falls back to a default test inbox.
 *
 * `mdaContactId` references {@link MdaContactEntity}. The FK is `ON DELETE SET
 * NULL` — a deleted contact leaves the config row intact with a null reference,
 * and the email processor falls back to the default inbox rather than throwing
 * into a stale production address.
 *
 * `config` is reserved JSONB for forthcoming per-form settings (the payment
 * processor override, tracked in #716); it is unused today.
 */
@Entity({ name: "form_config" })
@Index(["formId"], { unique: true })
export class FormConfigEntity extends TimestampedEntity {
  @ApiProperty({ example: "temp-teacher-application-barbados" })
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @ApiProperty({
    required: false,
    description:
      "FK → mda_contact.id (ON DELETE SET NULL). Null when no contact is set.",
    example: "3f1c2a9e-1b2c-4d5e-8f90-1a2b3c4d5e6f",
  })
  @Column({ name: "mda_contact_id", type: "uuid", nullable: true })
  mdaContactId!: string | null;

  @ApiProperty({
    description: "Reserved for future per-form config (#716). Unused today.",
    type: "object",
    additionalProperties: true,
  })
  @Column({ name: "config", type: "jsonb", nullable: true })
  config!: Record<string, unknown> | null;
}
