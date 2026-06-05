import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateImportRowItemDto {
  @IsUUID()
  rowId: string;

  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string;
}

export class UpdateImportRowsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateImportRowItemDto)
  rows: UpdateImportRowItemDto[];
}
