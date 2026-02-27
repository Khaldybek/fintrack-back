import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';
import { Category } from '../../categories/entities/category.entity';
import { TransactionSplit } from './transaction-split.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  /** Amount in minor units: positive = income, negative = expense */
  @Column({ name: 'amount_minor', type: 'integer' })
  amountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'KZT' })
  currency: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToMany(() => TransactionSplit, (s) => s.transaction)
  splits?: TransactionSplit[];
}
