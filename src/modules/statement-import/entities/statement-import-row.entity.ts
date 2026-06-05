import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { StatementImport } from './statement-import.entity';
import { Category } from '../../categories/entities/category.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Entity('statement_import_rows')
export class StatementImportRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'import_id', type: 'uuid' })
  importId: string;

  @ManyToOne(() => StatementImport, (i) => i.rows, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'import_id' })
  import: StatementImport;

  @Column({ name: 'row_index', type: 'integer' })
  rowIndex: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'amount_minor', type: 'integer' })
  amountMinor: number;

  @Column({ type: 'varchar', length: 3, default: 'KZT' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  memo: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column({ name: 'suggested_category_id', type: 'uuid', nullable: true })
  suggestedCategoryId: string | null;

  @Column({ type: 'boolean', default: true })
  selected: boolean;

  @Column({ name: 'is_duplicate', type: 'boolean', default: false })
  isDuplicate: boolean;

  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  @Column({ name: 'transaction_id', type: 'uuid', nullable: true })
  transactionId: string | null;

  @ManyToOne(() => Transaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transaction_id' })
  transaction: Transaction | null;

  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, unknown> | null;

  @Column({ name: 'parse_warning', type: 'text', nullable: true })
  parseWarning: string | null;
}
