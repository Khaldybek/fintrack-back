import { IsArray, IsNumber, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionSplitItemDto {
  @IsUUID()
  categoryId: string;

  @IsNumber()
  amountMinor: number;
}

export class SetSplitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionSplitItemDto)
  splits: TransactionSplitItemDto[];
}
