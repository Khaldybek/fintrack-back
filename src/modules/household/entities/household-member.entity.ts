import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Household } from './household.entity';

export type HouseholdRole = 'owner' | 'member' | 'viewer';

@Entity('household_members')
export class HouseholdMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'household_id', type: 'uuid' })
  householdId: string;

  @ManyToOne(() => Household, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'household_id' })
  household: Household;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 })
  role: HouseholdRole;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt: Date;
}
