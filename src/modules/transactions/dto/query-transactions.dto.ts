import { IsOptional, IsUUID, IsInt, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class QueryTransactionsDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'dateFrom must be YYYY-MM-DD' })
  dateFrom?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'dateTo must be YYYY-MM-DD' })
  dateTo?: string;

  @IsOptional()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}
