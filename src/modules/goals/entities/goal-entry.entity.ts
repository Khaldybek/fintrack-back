import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Goal } from './goal.entity';

@Entity('goal_entries')
export class GoalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'goal_id', type: 'uuid' })
  goalId: string;

  @ManyToOne(() => Goal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goal_id' })
  goal: Goal;

  /** Изменение баланса цели: положительное — пополнение, отрицательное — снятие (в минорных единицах) */
  @Column({ name: 'amount_minor', type: 'bigint' })
  amountMinor: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
