import { IsEmail, IsIn } from 'class-validator';

export class InviteHouseholdDto {
  @IsEmail()
  email: string;

  @IsIn(['owner', 'member', 'viewer'])
  role: 'owner' | 'member' | 'viewer';
}
