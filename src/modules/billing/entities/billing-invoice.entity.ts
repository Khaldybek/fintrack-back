import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BillingCheckoutSession } from './billing-checkout-session.entity';

export type BillingInvoiceStatus = 'paid' | 'failed';

@Entity('billing_invoices')
export class BillingInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'checkout_session_id', type: 'uuid', nullable: true })
  checkoutSessionId: string | null;

  @ManyToOne(() => BillingCheckoutSession, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'checkout_session_id' })
  checkoutSession: BillingCheckoutSession | null;

  @Column({ name: 'plan_code', type: 'varchar', length: 32 })
  planCode: string;

  @Column({ name: 'amount_minor', type: 'integer' })
  amountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'KZT' })
  currency: string;

  @Column({ type: 'varchar', length: 20 })
  status: BillingInvoiceStatus;

  @Column({ type: 'varchar', length: 200 })
  description: string;

  @Column({ name: 'mock_card_brand', type: 'varchar', length: 20, nullable: true })
  mockCardBrand: string | null;

  @Column({ name: 'mock_card_last4', type: 'varchar', length: 4, nullable: true })
  mockCardLast4: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
