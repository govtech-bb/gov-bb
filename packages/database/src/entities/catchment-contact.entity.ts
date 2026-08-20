import { Column, Entity, Index } from "typeorm";
import { TimestampedEntity } from "./entity-base";

/**
 * The Environmental Health notification inbox for one polyclinic catchment.
 *
 * These addresses used to be a hardcoded map in
 * `apps/api/src/catchment/polyclinic-routing.ts`, which meant rotating a
 * Ministry inbox took a code change and a deploy. They live here instead so an
 * environment can hold its own real addresses while the committed code holds
 * none.
 *
 * `catchmentName` is the **serving** catchment (see `SERVING_CATCHMENT`) — the
 * same key the routing map used, and exactly what
 * `CatchmentResolution.polyclinic` carries, so the lookup needs no translation.
 * A catchment served by another polyclinic has no row of its own.
 *
 * Routing data only: the catchment polygons, the parish fallbacks and the CMS
 * programme codes stay in version control, where a bad value still refuses to
 * boot the API.
 */
@Entity({ name: "catchment_contact" })
@Index(["catchmentName"], { unique: true })
export class CatchmentContactEntity extends TimestampedEntity {
  /** Serving catchment name, e.g. `St. Philip Polyclinic`. Unique. */
  @Column({ name: "catchment_name", type: "varchar", length: 100 })
  catchmentName!: string;

  /** Private notification recipient — never sent to the client. */
  @Column({ name: "mda_email", type: "varchar", length: 255 })
  mdaEmail!: string;
}
