import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubscriptionDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountMinor: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsDateString()
  nextPaymentDate: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  intervalDays: number;

  @IsUUID()
  categoryId: string;
}
