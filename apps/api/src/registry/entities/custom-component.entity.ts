import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../database/entities/entity-base';

@Entity({ name: 'custom_components' })
export class CustomComponent extends TimestampedEntity {
  @Column({ type: 'varchar', length: 100 })
  namespace: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'jsonb' })
  definition: Record<string, unknown>;
}
