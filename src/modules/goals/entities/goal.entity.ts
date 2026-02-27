import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { GoalEntry } from './goal-entry.entity';

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'target_minor', type: 'bigint' })
  targetMinor: number;

  @Column({ name: 'current_minor', type: 'bigint', default: 0 })
  currentMinor: number;

  @Column({ name: 'target_date', type: 'date' })
  targetDate: string;

  @Column({ type: 'varchar', length: 3, default: 'KZT' })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToMany(() => GoalEntry, (e) => e.goal)
  entries: GoalEntry[];
}
