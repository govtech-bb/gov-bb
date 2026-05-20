import { Column, Entity, Unique } from "typeorm";
import { TimestampedEntity } from "./entity-base";

@Entity({ name: "form_components" })
@Unique(["key", "version"])
export class FormComponentEntity extends TimestampedEntity {
  @Column({ type: "varchar", length: 100 })
  key!: string;

  @Column({ type: "varchar", length: 20 })
  version!: string;

  @Column({ type: "jsonb" })
  schema!: Record<string, unknown>;
}
