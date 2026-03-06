import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SuggestCategoryDto {
  @IsString()
  @MaxLength(500)
  memo: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  amountMinor?: number;
}
