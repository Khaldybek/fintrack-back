import { IsString, IsOptional, IsUUID, IsNumber, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsUUID()
  accountId: string;

  @IsUUID()
  categoryId: string;

  @IsNumber()
  @Type(() => Number)
  amountMinor: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}
