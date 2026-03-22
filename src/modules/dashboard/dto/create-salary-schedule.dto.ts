import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSalaryScheduleDto {
  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  dayOfMonth: number;

  @IsOptional()
  @IsString()
  label?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  amountMinor?: number | null;
}
