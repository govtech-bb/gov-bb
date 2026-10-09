import { Column, Entity, Unique } from "typeorm";
import { CreatedEntity } from "./entity-base";

/**
 * water_ops_alerts — what the alert checker has already told the ops team
 * (#2970). One row per signal key: "checker-crash", "send-failures", or
 * "skipped-notice:<guid|link>". A failing signal has failing_since set; it is
 * emailed when that is first set, reminded once last_alerted_at is old enough,
 * and marked recovered (failing_since cleared) exactly once.
 */
@Entity({ name: "water_ops_alerts" })
@Unique("uq_water_ops_alerts_key", ["key"])
export class WaterOpsAlertEntity extends CreatedEntity {
  @Column({ type: "varchar", length: 300 })
  key!: string;

  // NULL = healthy (or, for a skipped notice, not applicable).
  @Column({ name: "failing_since", type: "timestamp", nullable: true })
  failingSince!: Date | null;

  @Column({ name: "last_alerted_at", type: "timestamp", nullable: true })
  lastAlertedAt!: Date | null;
}
