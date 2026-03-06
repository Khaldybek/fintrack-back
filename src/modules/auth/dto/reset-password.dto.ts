import { IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(64, 64, { message: 'Некорректная ссылка сброса' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'Пароль должен быть не менее 8 символов' })
  newPassword: string;
}
