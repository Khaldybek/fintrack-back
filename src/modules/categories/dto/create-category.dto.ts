import { IsString, IsOptional, IsIn, Length, Matches } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsString()
  @IsIn(['income', 'expense'])
  type: 'income' | 'expense';

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be hex e.g. #ff0000' })
  color?: string | null;
}
