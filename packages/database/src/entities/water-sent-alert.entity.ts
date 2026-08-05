import { Column, Entity, Unique } from "typeorm";
import { CreatedEntity } from "./entity-base";

/**
 * water_sent_alerts — the "already emailed" logbook. One row per
 * (notice, subscriber): the checker claims a row (sent=false) then marks it
 * sent=true once the email is actually delivered, so a crash mid-send never
 * double-emails. UNIQUE(notice_id, subscriber_id) makes exactly-once delivery
 * enforceable at the database, even across concurrent checker runs.
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

  // false = claimed, true = email actually sent.
  @Column({ type: "boolean", default: false })
  sent!: boolean;
}
