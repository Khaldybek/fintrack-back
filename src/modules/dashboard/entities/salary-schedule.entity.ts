import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('salary_schedules')
export class SalarySchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Day of month (1–31) when salary is expected */
  @Column({ name: 'day_of_month', type: 'smallint' })
  dayOfMonth: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
