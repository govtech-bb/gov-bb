import { Column, Entity, Unique } from "typeorm";
import { TimestampedEntity } from "./entity-base";

export enum WaterSubscriberStatus {
  PENDING = "pending",
  CONFIRMED = "confirmed",
  UNSUBSCRIBED = "unsubscribed",
}

/**
 * water_subscribers — one row per (email, area) sign-up for water-outage alerts.
 * A person confirms via a double opt-in link (confirm_token) and can leave with
 * one click (unsubscribe_token). The same email may subscribe to several areas,
 * never the same area twice — UNIQUE(email, area) also guards sign-up races.
 */
@Entity({ name: "water_subscribers" })
@Unique("uq_water_subscribers_email_area", ["email", "area"])
export class WaterSubscriberEntity extends TimestampedEntity {
  @Column({ type: "varchar", length: 320 })
  email!: string;

  // "all" = all of Barbados, otherwise a parish slug (e.g. "saint-michael").
  @Column({ type: "varchar", length: 100 })
  area!: string;

  @Column({
    type: "enum",
    enum: WaterSubscriberStatus,
    enumName: "water_subscribers_status_enum",
    default: WaterSubscriberStatus.PENDING,
  })
  status!: WaterSubscriberStatus;

  @Column({ name: "confirm_token", type: "uuid", unique: true })
  confirmToken!: string;

  @Column({ name: "unsubscribe_token", type: "uuid", unique: true })
  unsubscribeToken!: string;

  @Column({ name: "confirmed_at", type: "timestamp", nullable: true })
  confirmedAt!: Date | null;
}
