import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Account } from '../../accounts/entities/account.entity';
import { StatementImportRow } from './statement-import-row.entity';

export type StatementImportStatus = 'preview' | 'confirmed' | 'cancelled';

@Entity('statement_imports')
export class StatementImport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ type: 'varchar', length: 20, default: 'preview' })
  status: StatementImportStatus;

  @Column({ name: 'bank_code', type: 'varchar', length: 32, default: 'generic' })
  bankCode: string;

  @Column({ name: 'bank_confidence', type: 'decimal', precision: 4, scale: 3, default: 0 })
  bankConfidence: number;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_format', type: 'varchar', length: 10 })
  fileFormat: string;

  @Column({ name: 'period_from', type: 'date', nullable: true })
  periodFrom: string | null;

  @Column({ name: 'period_to', type: 'date', nullable: true })
  periodTo: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @OneToMany(() => StatementImportRow, (r) => r.import)
  rows?: StatementImportRow[];
}
