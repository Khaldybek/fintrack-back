import { IsString, IsOptional, IsUUID, IsNumber, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransactionTemplateDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsNumber()
  @Type(() => Number)
  amountMinor: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
