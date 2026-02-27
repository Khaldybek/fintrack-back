import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBudgetDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limitMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
