import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateHouseholdBudgetDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsString()
  @Length(1, 100)
  categoryName: string;

  @IsInt()
  @Min(1)
  limitMinor: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
