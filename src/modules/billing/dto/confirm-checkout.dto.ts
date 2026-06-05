import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmCheckoutDto {
  @IsOptional()
  @IsBoolean()
  decline?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(13)
  @MaxLength(19)
  cardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cardBrand?: string;
}
