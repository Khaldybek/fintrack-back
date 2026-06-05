import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export type BillingSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

@Entity('user_billing_subscriptions')
export class UserBillingSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'plan_code', type: 'varchar', length: 32 })
  planCode: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: BillingSubscriptionStatus;

  @Column({ name: 'current_period_start', type: 'date' })
  currentPeriodStart: string;

  @Column({ name: 'current_period_end', type: 'date' })
  currentPeriodEnd: string;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'payment_method_last4', type: 'varchar', length: 4, nullable: true })
  paymentMethodLast4: string | null;

  @Column({ name: 'payment_method_brand', type: 'varchar', length: 20, nullable: true })
  paymentMethodBrand: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
