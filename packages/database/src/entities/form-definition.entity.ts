import { Column, Entity, Unique } from "typeorm";
import { TimestampedEntity } from "./entity-base";
import type { ServiceContractRecipe } from "@govtech-bb/form-types";

@Entity({ name: "form_definitions" })
// #1196: one scratch row per form. Version is retired — the published artifact
// is the committed flat recipe file, the DB row is just the current draft.
@Unique(["formId"])
export class FormDefinitionEntity extends TimestampedEntity {
  @Column({ name: "form_id", type: "varchar", length: 100 })
  formId!: string;

  // Nullable post-#1196 (versionless canonical recipes). Retained as a Phase-2
  // audit breadcrumb; new builder writes set it null. See migration M2.
  @Column({ type: "varchar", length: 20, nullable: true })
  version!: string | null;

  @Column({ type: "jsonb" })
  schema!: ServiceContractRecipe;

  @Column({ name: "published_at", type: "timestamp", nullable: true })
  publishedAt!: Date | null;
}
