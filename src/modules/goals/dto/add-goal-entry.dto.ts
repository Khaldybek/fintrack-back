import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AddGoalEntryDto {
  /** Изменение: положительное — пополнение цели, отрицательное — снятие (в минорных единицах) */
  @IsInt()
  @Type(() => Number)
  amountMinor: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
