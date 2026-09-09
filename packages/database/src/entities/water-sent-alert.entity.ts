import { Column, Entity, Unique } from "typeorm";
import { CreatedEntity } from "./entity-base";

/**
 * water_sent_alerts — the "already emailed" logbook. One row per
 * (notice, subscriber): the checker claims a row (sent=false) then marks it
 * sent=true once SES accepts the email. The unique constraint prevents duplicate
 * claims; the checker's advisory lock prevents concurrent scheduled sends.
 * ponytail: a crash after SES accepts a send but before it is recorded can
 * duplicate that email on retry; stronger guarantees need a delivery provider
 * with idempotency support.
 */
@Entity({ name: "water_sent_alerts" })
@Unique("uq_water_sent_alerts_notice_subscriber", ["noticeId", "subscriberId"])
export class WaterSentAlertEntity extends CreatedEntity {
  // The BWA notice id/guid the alert is for.
  @Column({ name: "notice_id", type: "varchar", length: 512 })
  noticeId!: string;

  // FK → water_subscribers.id (constraint defined in the migration).
  @Column({ name: "subscriber_id", type: "uuid" })
  subscriberId!: string;

  // false = claimed, true = SES accepted the email.
  @Column({ type: "boolean", default: false })
  sent!: boolean;
}
