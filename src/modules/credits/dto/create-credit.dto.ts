import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bank?: string | null;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  principalMinor: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  ratePct: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  termMonths: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  monthlyPaymentMinor: number;

  /** День месяца для платежа (1–31). Необязательно. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  paymentDayOfMonth?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
