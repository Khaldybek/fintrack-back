import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  targetMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  currentMinor?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
