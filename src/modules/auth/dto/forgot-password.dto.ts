import { IsEmail, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Укажите корректный email' })
  @MinLength(5)
  @MaxLength(255)
  email: string;
}
