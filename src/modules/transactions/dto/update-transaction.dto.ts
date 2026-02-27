import { IsString, IsOptional, IsUUID, IsNumber, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTransactionDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}
