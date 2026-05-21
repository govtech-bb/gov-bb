import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export abstract class UuidEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;
}

export abstract class CreatedEntity extends UuidEntity {
  @CreateDateColumn({
    name: "created_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  createdAt!: Date;
}

export abstract class TimestampedEntity extends CreatedEntity {
  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  updatedAt!: Date;
}
