import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { InviteHouseholdDto } from './dto/invite-household.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class HouseholdService {
  constructor(
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
    private readonly usersService: UsersService,
  ) {}

  /** Get household where current user is a member, or null if none */
  async getHousehold(userId: string): Promise<{
    id: string;
    name: string;
    members: Array<{
      id: string;
      userId: string;
      email: string;
      name: string | null;
      role: 'owner' | 'member' | 'viewer';
      joinedAt: string;
    }>;
  } | null> {
    const membership = await this.memberRepo.findOne({
      where: { userId },
      relations: ['household', 'household.members', 'household.members.user'],
    });
    if (!membership?.household) return null;
    const household = membership.household;
    const members = await this.memberRepo.find({
      where: { householdId: household.id },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
    return {
      id: household.id,
      name: household.name,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name ?? null,
        role: m.role as 'owner' | 'member' | 'viewer',
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }

  /** Create household (current user becomes owner) */
  async create(userId: string, dto: CreateHouseholdDto) {
    const existing = await this.getHousehold(userId);
    if (existing) throw new BadRequestException('User already belongs to a household');
    const household = this.householdRepo.create({ name: dto.name, ownerId: userId });
    const saved = await this.householdRepo.save(household);
    const member = this.memberRepo.create({
      householdId: saved.id,
      userId,
      role: 'owner',
    });
    await this.memberRepo.save(member);
    return this.getHousehold(userId);
  }

  /** Invite user by email to current user's household */
  async invite(userId: string, dto: InviteHouseholdDto) {
    const householdData = await this.getHousehold(userId);
    if (!householdData) throw new BadRequestException('Create or join a household first');
    const invitedUser = await this.usersService.findByEmail(dto.email);
    if (!invitedUser) throw new NotFoundException('User with this email not found');
    if (invitedUser.id === userId) throw new BadRequestException('Cannot invite yourself');
    const existing = await this.memberRepo.findOne({
      where: { householdId: householdData.id, userId: invitedUser.id },
    });
    if (existing) throw new BadRequestException('User is already a member');
    const member = this.memberRepo.create({
      householdId: householdData.id,
      userId: invitedUser.id,
      role: dto.role,
    });
    await this.memberRepo.save(member);
    return this.getHousehold(userId);
  }

  /** Update a member's role (only owner or same member for self) */
  async updateMemberRole(
    userId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const householdData = await this.getHousehold(userId);
    if (!householdData) throw new NotFoundException('Household not found');
    const member = await this.memberRepo.findOne({
      where: { id: memberId, householdId: householdData.id },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');
    const currentUserMember = await this.memberRepo.findOne({
      where: { householdId: householdData.id, userId },
    });
    if (!currentUserMember) throw new NotFoundException('Household not found');
    const isOwner = currentUserMember.role === 'owner';
    const isSelf = member.userId === userId;
    if (!isOwner && !isSelf) throw new BadRequestException('Only owner can change other members');
    if (isSelf && dto.role !== 'owner' && currentUserMember.role === 'owner') {
      const ownerCount = await this.memberRepo.count({
        where: { householdId: householdData.id, role: 'owner' },
      });
      if (ownerCount <= 1) throw new BadRequestException('Household must have at least one owner');
    }
    member.role = dto.role as HouseholdMember['role'];
    await this.memberRepo.save(member);
    return this.getHousehold(userId);
  }
}
