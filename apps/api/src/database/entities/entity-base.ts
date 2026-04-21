import {
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";

export abstract class UuidEntity {
  @ApiProperty({ example: "550e8400-e29b-41d4-a716-446655440000", description: "Auto-generated UUID" })
  @PrimaryGeneratedColumn("uuid")
  id!: string;
}

export abstract class CreatedEntity extends UuidEntity {
  @ApiProperty({ example: "2026-04-16T09:00:00.000Z" })
  @CreateDateColumn({
    name: "created_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  createdAt!: Date;
}

export abstract class TimestampedEntity extends CreatedEntity {
  @ApiProperty({ example: "2026-04-16T10:00:00.000Z" })
  @UpdateDateColumn({
    name: "updated_at",
    type: "timestamp",
    default: () => "NOW()",
  })
  updatedAt!: Date;
}
