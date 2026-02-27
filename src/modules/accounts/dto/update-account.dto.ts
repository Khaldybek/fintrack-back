import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'Currency must be a 3-letter code (e.g. KZT)' })
  currency?: string;
}
