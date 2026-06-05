import { IsString, Length } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @Length(32, 128)
  token: string;
}
