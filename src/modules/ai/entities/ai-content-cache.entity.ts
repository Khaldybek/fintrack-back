import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_content_cache')
@Unique(['userId', 'feature', 'periodKey'])
export class AiContentCache {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 64 })
  feature: string;

  @Column({ name: 'period_key', type: 'varchar', length: 64 })
  periodKey: string;

  @Column({ name: 'context_hash', type: 'char', length: 64 })
  contextHash: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
