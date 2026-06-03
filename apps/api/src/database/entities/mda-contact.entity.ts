import { Column, Entity } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { TimestampedEntity } from "./entity-base";

/**
 * Public department address stored on a contact. Mirrors the `address` shape in
 * the form-types `contactDetails` schema so the public subset can be copied
 * verbatim into a recipe.
 */
export interface MdaContactAddress {
  line1: string;
  line2?: string;
  city: string;
  country?: string;
}

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
  @ApiProperty({ example: "Ministry of Education — Teacher Recruitment" })
  @Column({ name: "label", type: "varchar", length: 255 })
  label!: string;

  @ApiProperty({ example: "Ministry of Education" })
  @Column({ name: "title", type: "varchar", length: 255 })
  title!: string;

  @ApiProperty({ example: "+1 246-555-0100" })
  @Column({ name: "telephone", type: "varchar", length: 50 })
  telephone!: string;

  @ApiProperty({ example: "info@education.gov.bb" })
  @Column({ name: "email", type: "varchar", length: 255 })
  email!: string;

  @ApiProperty({
    description: "Public address. Null when not provided.",
    type: "object",
    additionalProperties: true,
    example: {
      line1: "Constitution Road",
      city: "Bridgetown",
      country: "Barbados",
    },
  })
  @Column({ name: "address", type: "jsonb", nullable: true })
  address!: MdaContactAddress | null;

  @ApiProperty({
    description:
      "Private notification recipient — DB-only, never sent to the client.",
    example: "recruitment-notify@education.gov.bb",
  })
  @Column({ name: "mda_email", type: "varchar", length: 255 })
  mdaEmail!: string;
}
