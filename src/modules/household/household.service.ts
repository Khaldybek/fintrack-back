import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { InviteHouseholdDto } from './dto/invite-household.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UsersService } from '../users/users.service';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { toMoneyDto } from '../../common/money.util';
import { getCurrentMonthRange } from '../../common/date.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class HouseholdService {
  constructor(
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly usersService: UsersService,
  ) {}

  private async membershipOrThrow(userId: string): Promise<HouseholdMember> {
    const membership = await this.memberRepo.findOne({
      where: { userId },
      relations: ['household', 'user'],
    });
    if (!membership?.household) throw new NotFoundException('Household not found');
    return membership;
  }

  private async syncOwnerId(householdId: string): Promise<void> {
    const household = await this.householdRepo.findOne({ where: { id: householdId } });
    if (!household) throw new NotFoundException('Household not found');
    const owners = await this.memberRepo.find({
      where: { householdId, role: 'owner' },
      order: { joinedAt: 'ASC' },
    });
    if (owners.length === 0) throw new BadRequestException('Household must have at least one owner');
    const hasValidOwnerId = owners.some((m) => m.userId === household.ownerId);
    if (!hasValidOwnerId) {
      household.ownerId = owners[0].userId;
      await this.householdRepo.save(household);
    }
  }

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
    const current = await this.membershipOrThrow(userId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot invite members');
    }
    const invitedUser = await this.usersService.findByEmail(dto.email);
    if (!invitedUser) throw new NotFoundException('User with this email not found');
    if (invitedUser.id === userId) throw new BadRequestException('Cannot invite yourself');
    const invitedCurrent = await this.memberRepo.findOne({ where: { userId: invitedUser.id } });
    if (invitedCurrent) throw new BadRequestException('User already belongs to another household');
    const existing = await this.memberRepo.findOne({
      where: { householdId: current.householdId, userId: invitedUser.id },
    });
    if (existing) throw new BadRequestException('User is already a member');
    const member = this.memberRepo.create({
      householdId: current.householdId,
      userId: invitedUser.id,
      role: dto.role,
    });
    await this.memberRepo.save(member);
    return this.getHousehold(userId);
  }

  /** Update a member's role (owner only) */
  async updateMemberRole(
    userId: string,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const current = await this.membershipOrThrow(userId);
    if (current.role !== 'owner') throw new BadRequestException('Only owner can change roles');
    const member = await this.memberRepo.findOne({
      where: { id: memberId, householdId: current.householdId },
      relations: ['user'],
    });
    if (!member) throw new NotFoundException('Member not found');
    const isSelf = member.userId === userId;
    if (isSelf && dto.role !== 'owner') {
      const ownerCount = await this.memberRepo.count({
        where: { householdId: current.householdId, role: 'owner' },
      });
      if (ownerCount <= 1) throw new BadRequestException('Household must have at least one owner');
    }
    member.role = dto.role as HouseholdMember['role'];
    await this.memberRepo.save(member);
    await this.syncOwnerId(current.householdId);
    return this.getHousehold(userId);
  }

  async removeMember(userId: string, memberId: string): Promise<void> {
    const current = await this.membershipOrThrow(userId);
    if (current.role !== 'owner') throw new BadRequestException('Only owner can remove members');
    const member = await this.memberRepo.findOne({
      where: { id: memberId, householdId: current.householdId },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.userId === userId) {
      throw new BadRequestException('Use leave endpoint to leave household');
    }
    if (member.role === 'owner') {
      const ownerCount = await this.memberRepo.count({
        where: { householdId: current.householdId, role: 'owner' },
      });
      if (ownerCount <= 1) throw new BadRequestException('Household must have at least one owner');
    }
    await this.memberRepo.remove(member);
    await this.syncOwnerId(current.householdId);
  }

  async leave(userId: string): Promise<void> {
    const current = await this.membershipOrThrow(userId);
    if (current.role === 'owner') {
      const ownerCount = await this.memberRepo.count({
        where: { householdId: current.householdId, role: 'owner' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Transfer owner role before leaving household');
      }
    }
    await this.memberRepo.remove(current);
    const membersLeft = await this.memberRepo.count({ where: { householdId: current.householdId } });
    if (membersLeft === 0) {
      await this.householdRepo.delete({ id: current.householdId });
      return;
    }
    await this.syncOwnerId(current.householdId);
  }

  async getOverview(userId: string, dateFrom?: string, dateTo?: string) {
    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      throw new BadRequestException('dateFrom and dateTo must be provided together');
    }
    if (dateFrom && !DATE_PATTERN.test(dateFrom)) throw new BadRequestException('dateFrom must be YYYY-MM-DD');
    if (dateTo && !DATE_PATTERN.test(dateTo)) throw new BadRequestException('dateTo must be YYYY-MM-DD');
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException('dateFrom must be less than or equal to dateTo');
    }

    const current = await this.membershipOrThrow(userId);
    const user = await this.usersService.findById(userId);
    const range = dateFrom && dateTo ? { dateFrom, dateTo } : getCurrentMonthRange(user?.timezone ?? 'UTC');

    const members = await this.memberRepo.find({
      where: { householdId: current.householdId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
    const memberUserIds = members.map((m) => m.userId);
    const accounts = await this.accountRepo.find({
      where: { userId: In(memberUserIds) },
      select: ['id', 'userId', 'balanceMinor', 'currency'],
    });
    const accountIds = accounts.map((a) => a.id);
    const currency = accounts[0]?.currency ?? 'KZT';
    const balanceMinor = accounts.reduce((sum, a) => sum + Number(a.balanceMinor), 0);

    let incomeMinor = 0;
    let expenseMinor = 0;
    if (accountIds.length > 0) {
      const row = await this.txRepo
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.amount_minor > 0 THEN t.amount_minor ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.amount_minor < 0 THEN ABS(t.amount_minor) ELSE 0 END)', 'expense')
        .where('t.account_id IN (:...ids)', { ids: accountIds })
        .andWhere('t.date >= :dateFrom', { dateFrom: range.dateFrom })
        .andWhere('t.date <= :dateTo', { dateTo: range.dateTo })
        .andWhere('t.deleted_at IS NULL')
        .getRawOne<{ income: string; expense: string }>();
      incomeMinor = Number(row?.income ?? 0);
      expenseMinor = Number(row?.expense ?? 0);
    }

    const balanceByMember = members.map((m) => {
      const memberBalanceMinor = accounts
        .filter((a) => a.userId === m.userId)
        .reduce((sum, a) => sum + Number(a.balanceMinor), 0);
      return {
        userId: m.userId,
        name: m.user.name ?? m.user.email,
        role: m.role,
        balance: toMoneyDto(memberBalanceMinor, currency),
        balance_minor: memberBalanceMinor,
      };
    });

    return {
      household: {
        id: current.householdId,
        name: current.household.name,
        my_role: current.role,
        members_count: members.length,
      },
      period: range,
      totals: {
        balance: toMoneyDto(balanceMinor, currency),
        balance_minor: balanceMinor,
        income: toMoneyDto(incomeMinor, currency),
        income_minor: incomeMinor,
        expense: toMoneyDto(expenseMinor, currency),
        expense_minor: expenseMinor,
      },
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name ?? null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      balances_by_member: balanceByMember,
    };
  }
}
