import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  nextPaymentDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  intervalDays?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
