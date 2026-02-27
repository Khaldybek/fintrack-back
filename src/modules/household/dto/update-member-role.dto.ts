import { IsIn } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['owner', 'member', 'viewer'])
  role: 'owner' | 'member' | 'viewer';
}
