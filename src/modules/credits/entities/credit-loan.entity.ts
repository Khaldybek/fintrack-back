import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('credit_loans')
export class CreditLoan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 200, nullable: true })
  bank: string | null;

  @Column({ name: 'principal_minor', type: 'integer' })
  principalMinor: number;

  @Column({ name: 'rate_pct', type: 'decimal', precision: 5, scale: 2 })
  ratePct: number;

  @Column({ name: 'term_months', type: 'smallint' })
  termMonths: number;

  @Column({ name: 'monthly_payment_minor', type: 'integer' })
  monthlyPaymentMinor: number;

  /** День месяца, когда платёж (1–31). Если null — считать 1-е. */
  @Column({ name: 'payment_day_of_month', type: 'smallint', nullable: true })
  paymentDayOfMonth: number | null;

  @Column({ type: 'varchar', length: 2, default: 'KZT' })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
