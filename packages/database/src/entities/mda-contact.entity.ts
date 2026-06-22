import { Column, Entity } from "typeorm";
import { TimestampedEntity } from "./entity-base";
import type { MdaContactAddress } from "@govtech-bb/form-types";

// The address shape is single-sourced in @govtech-bb/form-types (issue #1397 /
// DUP-04). Re-exported so `@govtech-bb/database`'s existing
// `MdaContactAddress` public export keeps resolving.
export type { MdaContactAddress };

/**
 * A reusable directory of MDA/department contacts an author can pick from in
 * the form builder.
 *
 * The **public** subset (`title`, `telephone`, `email`, `address`) maps to the
 * `contactDetails` shape and is what gets copied into the published recipe.
 * `mdaEmail` is the **private** notification recipient — it stays in the DB and
 * never enters the service contract sent to the client.
 */
@Entity({ name: "mda_contact" })
export class MdaContactEntity extends TimestampedEntity {
  /** Human-friendly name shown in the directory dropdown. */
  @Column({ name: "label", type: "varchar", length: 255 })
  label!: string;

  /** Public department title. */
  @Column({ name: "title", type: "varchar", length: 255 })
  title!: string;

  /** Public telephone number. */
  @Column({ name: "telephone", type: "varchar", length: 50 })
  telephone!: string;

  /** Public department email — copied into the recipe. */
  @Column({ name: "email", type: "varchar", length: 255 })
  email!: string;

  /** Public address. */
  @Column({ name: "address", type: "jsonb", nullable: true })
  address!: MdaContactAddress | null;

  /** Private notification recipient — DB-only, never sent to the client. */
  @Column({ name: "mda_email", type: "varchar", length: 255 })
  mdaEmail!: string;
}
