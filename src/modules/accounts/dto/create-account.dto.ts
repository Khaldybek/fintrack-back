import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code (e.g. KZT)' })
  currency?: string;

  /** Начальный баланс в amount_minor (KZT: целые тенге). По умолчанию 0. */
  @IsOptional()
  @IsInt()
  balanceMinor?: number;

  @IsOptional()
  @IsBoolean()
  sharedWithHousehold?: boolean;
}
