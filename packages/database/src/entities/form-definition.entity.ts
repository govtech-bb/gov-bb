import { Column, Entity, Unique } from "typeorm";
import { TimestampedEntity } from "./entity-base";
import { ServiceContractRecipe } from "@govtech-bb/form-types";

@Entity({ name: "form_definitions" })
@Unique(["formId", "version"])
export class FormDefinitionEntity extends TimestampedEntity {
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  @Column({ type: "varchar", length: 20 })
  version!: string;

  @Column({ type: "jsonb" })
  schema!: ServiceContractRecipe;

  @Column({ name: "published_at", type: "timestamp", nullable: true })
  publishedAt!: Date | null;
}
