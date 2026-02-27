import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoalDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  targetMinor: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  currentMinor?: number;

  @IsDateString()
  targetDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
