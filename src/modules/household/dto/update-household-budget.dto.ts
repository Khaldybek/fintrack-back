import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class UpdateHouseholdBudgetDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  categoryName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limitMinor?: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
