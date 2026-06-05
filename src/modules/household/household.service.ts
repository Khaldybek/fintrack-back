import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { HouseholdInvite } from './entities/household-invite.entity';
import { HouseholdBudget } from './entities/household-budget.entity';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { InviteHouseholdDto } from './dto/invite-household.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateHouseholdBudgetDto } from './dto/create-household-budget.dto';
import { UpdateHouseholdBudgetDto } from './dto/update-household-budget.dto';
import { QueryHouseholdTransactionsDto } from './dto/query-household-transactions.dto';
import { UsersService } from '../users/users.service';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { toMoneyDto } from '../../common/money.util';
import { getCurrentMonthRange } from '../../common/date.util';
import { PlanService } from '../billing/plan.service';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';
import { HouseholdMailService } from './household-mail.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVITE_TTL_DAYS = 7;

function progressSeverity(percent: number): 'good' | 'attention' | 'risk' {
  if (percent >= 100) return 'risk';
  if (percent >= 85) return 'risk';
  if (percent >= 70) return 'attention';
  return 'good';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class HouseholdService {
  constructor(
    @InjectRepository(Household)
    private readonly householdRepo: Repository<Household>,
    @InjectRepository(HouseholdMember)
    private readonly memberRepo: Repository<HouseholdMember>,
    @InjectRepository(HouseholdInvite)
    private readonly inviteRepo: Repository<HouseholdInvite>,
    @InjectRepository(HouseholdBudget)
    private readonly budgetRepo: Repository<HouseholdBudget>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly usersService: UsersService,
    private readonly planService: PlanService,
    private readonly mailService: HouseholdMailService,
    private readonly config: ConfigService,
  ) {}

  private async membershipOrThrow(userId: string): Promise<HouseholdMember> {
    const membership = await this.memberRepo.findOne({
      where: { userId },
      relations: ['household', 'user'],
    });
    if (!membership?.household) throw new NotFoundException('Household not found');
    return membership;
  }

  private async getHouseholdMembersLimit(householdId: string): Promise<number | null> {
    const household = await this.householdRepo.findOne({ where: { id: householdId } });
    if (!household) return null;
    const limits = await this.planService.getLimits(household.ownerId);
    return limits.householdMembers;
  }

  private async assertHouseholdOwnerHasFamily(householdId: string): Promise<void> {
    const household = await this.householdRepo.findOne({ where: { id: householdId } });
    if (!household) throw new NotFoundException('Household not found');
    const ok = await this.planService.hasFeature(household.ownerId, 'familyMode');
    if (!ok) {
      throw new FeatureGatedException(
        'family_mode',
        'Household owner needs an active Family subscription.',
      );
    }
  }

  private async countSlotsUsed(householdId: string): Promise<{ members: number; pending: number }> {
    const members = await this.memberRepo.count({ where: { householdId } });
    const pending = await this.inviteRepo.count({
      where: { householdId, status: 'pending' },
    });
    return { members, pending };
  }

  async assertHouseholdSlotAvailable(householdId: string, _actingUserId: string): Promise<void> {
    const max = await this.getHouseholdMembersLimit(householdId);
    if (max === null) return;
    const { members, pending } = await this.countSlotsUsed(householdId);
    if (members + pending >= max) {
      throw new FeatureGatedException(
        'household_members_limit',
        `Household member limit reached (${max}).`,
      );
    }
  }

  private async assertMemberSlotForAccept(householdId: string, _ownerUserId: string): Promise<void> {
    const max = await this.getHouseholdMembersLimit(householdId);
    if (max === null) return;
    const members = await this.memberRepo.count({ where: { householdId } });
    if (members >= max) {
      throw new FeatureGatedException(
        'household_members_limit',
        `Household member limit reached (${max}).`,
      );
    }
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

  private async getPendingInvites(householdId: string) {
    const invites = await this.inviteRepo.find({
      where: { householdId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    return invites
      .filter((i) => i.expiresAt > now)
      .map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }));
  }

  private roleFeatures(role: string) {
    return {
      canInvite: role === 'owner' || role === 'member',
      canManageBudgets: role === 'owner' || role === 'member',
    };
  }

  async getHousehold(userId: string) {
    const membership = await this.memberRepo.findOne({
      where: { userId },
      relations: ['household'],
    });
    if (!membership?.household) return null;

    const household = membership.household;
    const members = await this.memberRepo.find({
      where: { householdId: household.id },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
    const { members: membersCount, pending: pendingCount } = await this.countSlotsUsed(household.id);
    const membersLimit = await this.getHouseholdMembersLimit(household.id);

    return {
      id: household.id,
      name: household.name,
      members: members.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name ?? null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      pendingInvites: await this.getPendingInvites(household.id),
      membersLimit,
      membersCount,
      pendingCount,
      features: this.roleFeatures(membership.role),
      myRole: membership.role,
    };
  }

  async create(userId: string, dto: CreateHouseholdDto) {
    await this.planService.assertFeature(
      userId,
      'familyMode',
      'family_mode',
      'Upgrade to Family plan to create a household.',
    );
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

  async invite(userId: string, dto: InviteHouseholdDto) {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot invite members');
    }

    const email = dto.email.trim().toLowerCase();
    const self = await this.usersService.findById(userId);
    if (self?.email === email) throw new BadRequestException('Cannot invite yourself');

    const members = await this.memberRepo.find({
      where: { householdId: current.householdId },
      relations: ['user'],
    });
    if (members.some((m) => m.user.email === email)) {
      throw new BadRequestException('User is already a member');
    }

    const invitedUser = await this.usersService.findByEmail(email);
    if (invitedUser) {
      const other = await this.memberRepo.findOne({ where: { userId: invitedUser.id } });
      if (other) throw new BadRequestException('User already belongs to another household');
    }

    await this.assertHouseholdSlotAvailable(current.householdId, userId);

    const existingPending = await this.inviteRepo.findOne({
      where: { householdId: current.householdId, email, status: 'pending' },
    });
    if (existingPending) {
      throw new BadRequestException('Pending invite already exists for this email');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    const invite = this.inviteRepo.create({
      householdId: current.householdId,
      email,
      role: dto.role,
      tokenHash: hashToken(token),
      invitedByUserId: userId,
      status: 'pending',
      expiresAt,
    });
    const saved = await this.inviteRepo.save(invite);

    const frontendUrl = this.config.get<string>('auth.frontendUrl') ?? process.env.FRONTEND_URL ?? '';
    const acceptLink = frontendUrl
      ? `${frontendUrl.replace(/\/$/, '')}/household/accept?token=${token}`
      : '';

    await this.mailService.sendInviteEmail({
      to: email,
      householdName: current.household.name,
      role: dto.role,
      acceptLink,
    });

    return {
      inviteId: saved.id,
      email: saved.email,
      role: saved.role,
      status: saved.status,
      expiresAt: saved.expiresAt.toISOString(),
      household: await this.getHousehold(userId),
    };
  }

  async listInvites(userId: string) {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot list invites');
    }
    return { items: await this.getPendingInvites(current.householdId) };
  }

  async cancelInvite(userId: string, inviteId: string) {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot cancel invites');
    }
    const invite = await this.inviteRepo.findOne({
      where: { id: inviteId, householdId: current.householdId, status: 'pending' },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    invite.status = 'cancelled';
    await this.inviteRepo.save(invite);
    return { success: true };
  }

  async previewInvite(token: string) {
    if (!token?.trim()) throw new BadRequestException('token is required');
    const invite = await this.inviteRepo.findOne({
      where: { tokenHash: hashToken(token.trim()), status: 'pending' },
      relations: ['household'],
    });
    if (!invite) throw new NotFoundException('Invite not found');
    const expired = invite.expiresAt < new Date();
    if (expired) {
      invite.status = 'expired';
      await this.inviteRepo.save(invite);
    }
    return {
      householdName: invite.household?.name ?? 'Family',
      email: invite.email,
      role: invite.role,
      expired,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async acceptInvite(userId: string, userEmail: string, token: string) {
    if (!token?.trim()) throw new BadRequestException('token is required');
    const normalizedEmail = userEmail.trim().toLowerCase();

    const invite = await this.inviteRepo.findOne({
      where: { tokenHash: hashToken(token.trim()), status: 'pending' },
      relations: ['household'],
    });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await this.inviteRepo.save(invite);
      throw new BadRequestException('Invite expired');
    }
    if (invite.email !== normalizedEmail) {
      throw new ForbiddenException(
        `Sign in as ${invite.email} to accept this invite`,
      );
    }

    const existing = await this.memberRepo.findOne({ where: { userId } });
    if (existing) throw new BadRequestException('User already belongs to a household');

    const ownerId = invite.household?.ownerId;
    if (ownerId) {
      await this.assertMemberSlotForAccept(invite.householdId, ownerId);
    }

    const member = this.memberRepo.create({
      householdId: invite.householdId,
      userId,
      role: invite.role,
    });
    await this.memberRepo.save(member);
    invite.status = 'accepted';
    await this.inviteRepo.save(invite);

    return this.getHousehold(userId);
  }

  async updateMemberRole(userId: string, memberId: string, dto: UpdateMemberRoleDto) {
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

  private async getMemberUserIds(householdId: string): Promise<string[]> {
    const members = await this.memberRepo.find({
      where: { householdId },
      select: ['userId'],
    });
    return members.map((m) => m.userId);
  }

  async getBudgets(userId: string, timezone: string) {
    const current = await this.membershipOrThrow(userId);
    const budgets = await this.budgetRepo.find({
      where: { householdId: current.householdId },
      order: { createdAt: 'ASC' },
    });
    const memberUserIds = await this.getMemberUserIds(current.householdId);
    const { dateFrom, dateTo } = getCurrentMonthRange(timezone);
    const result: ReturnType<typeof this.budgetToResponse>[] = [];
    for (const b of budgets) {
      const spent = await this.getSpentForCategoryName(
        b.categoryName,
        memberUserIds,
        dateFrom,
        dateTo,
      );
      result.push(this.budgetToResponse(b, spent));
    }
    return result;
  }

  private async getSpentForCategoryName(
    categoryName: string,
    memberUserIds: string[],
    dateFrom: string,
    dateTo: string,
  ): Promise<number> {
    if (memberUserIds.length === 0) return 0;
    const accounts = await this.accountRepo.find({
      where: { userId: In(memberUserIds) },
      select: ['id'],
    });
    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) return 0;

    const row = await this.txRepo
      .createQueryBuilder('t')
      .innerJoin('t.category', 'c')
      .select('COALESCE(SUM(ABS(t.amount_minor)), 0)', 'sum')
      .where('t.account_id IN (:...accountIds)', { accountIds })
      .andWhere('LOWER(c.name) = LOWER(:categoryName)', { categoryName })
      .andWhere('t.date >= :dateFrom', { dateFrom })
      .andWhere('t.date <= :dateTo', { dateTo })
      .andWhere('t.amount_minor < 0')
      .andWhere('t.deleted_at IS NULL')
      .getRawOne<{ sum: string }>();
    return parseInt(row?.sum ?? '0', 10);
  }

  private budgetToResponse(budget: HouseholdBudget, spent: number) {
    const percent = budget.limitMinor > 0 ? Math.round((spent / budget.limitMinor) * 100) : 0;
    const severity = progressSeverity(percent);
    return {
      id: budget.id,
      name: budget.name,
      categoryName: budget.categoryName,
      limit: toMoneyDto(budget.limitMinor, budget.currency),
      limit_minor: budget.limitMinor,
      spent: toMoneyDto(spent, budget.currency),
      spent_minor: spent,
      progress_percent: percent,
      severity,
      status: severity === 'risk' ? 'risk' : severity === 'attention' ? 'attention' : 'stable',
      currency: budget.currency,
    };
  }

  async createBudget(userId: string, dto: CreateHouseholdBudgetDto, timezone: string) {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot manage budgets');
    }
    const budget = this.budgetRepo.create({
      householdId: current.householdId,
      name: dto.name,
      categoryName: dto.categoryName,
      limitMinor: dto.limitMinor,
      currency: dto.currency ?? 'KZT',
      createdByUserId: userId,
    });
    const saved = await this.budgetRepo.save(budget);
    const memberUserIds = await this.getMemberUserIds(current.householdId);
    const { dateFrom, dateTo } = getCurrentMonthRange(timezone);
    const spent = await this.getSpentForCategoryName(
      saved.categoryName,
      memberUserIds,
      dateFrom,
      dateTo,
    );
    return this.budgetToResponse(saved, spent);
  }

  async updateBudget(
    userId: string,
    budgetId: string,
    dto: UpdateHouseholdBudgetDto,
    timezone: string,
  ) {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role === 'viewer') {
      throw new BadRequestException('Viewer cannot manage budgets');
    }
    const budget = await this.budgetRepo.findOne({
      where: { id: budgetId, householdId: current.householdId },
    });
    if (!budget) throw new NotFoundException('Budget not found');
    if (dto.name !== undefined) budget.name = dto.name;
    if (dto.categoryName !== undefined) budget.categoryName = dto.categoryName;
    if (dto.limitMinor !== undefined) budget.limitMinor = dto.limitMinor;
    if (dto.currency !== undefined) budget.currency = dto.currency;
    await this.budgetRepo.save(budget);
    const memberUserIds = await this.getMemberUserIds(current.householdId);
    const { dateFrom, dateTo } = getCurrentMonthRange(timezone);
    const spent = await this.getSpentForCategoryName(
      budget.categoryName,
      memberUserIds,
      dateFrom,
      dateTo,
    );
    return this.budgetToResponse(budget, spent);
  }

  async removeBudget(userId: string, budgetId: string): Promise<void> {
    const current = await this.membershipOrThrow(userId);
    await this.assertHouseholdOwnerHasFamily(current.householdId);
    if (current.role !== 'owner') {
      throw new BadRequestException('Only owner can delete household budgets');
    }
    const budget = await this.budgetRepo.findOne({
      where: { id: budgetId, householdId: current.householdId },
    });
    if (!budget) throw new NotFoundException('Budget not found');
    await this.budgetRepo.remove(budget);
  }

  async getSharedAccounts(userId: string) {
    const current = await this.membershipOrThrow(userId);
    const memberUserIds = await this.getMemberUserIds(current.householdId);
    const members = await this.memberRepo.find({
      where: { householdId: current.householdId },
      relations: ['user'],
    });
    const userMap = new Map(members.map((m) => [m.userId, m.user]));

    const accounts = await this.accountRepo.find({
      where: { userId: In(memberUserIds), sharedWithHousehold: true },
      order: { createdAt: 'ASC' },
    });

    return accounts.map((a) => {
      const owner = userMap.get(a.userId);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: toMoneyDto(Number(a.balanceMinor), a.currency),
        sharedWithHousehold: true,
        owner: {
          userId: a.userId,
          name: owner?.name ?? null,
          email: owner?.email ?? '',
        },
        isMine: a.userId === userId,
      };
    });
  }

  async getSharedTransactions(userId: string, query: QueryHouseholdTransactionsDto) {
    const current = await this.membershipOrThrow(userId);
    let memberUserIds = await this.getMemberUserIds(current.householdId);
    if (query.memberUserId) {
      if (!memberUserIds.includes(query.memberUserId)) {
        throw new BadRequestException('Member not in household');
      }
      memberUserIds = [query.memberUserId];
    }

    const sharedAccounts = await this.accountRepo.find({
      where: { userId: In(memberUserIds), sharedWithHousehold: true },
      select: ['id', 'userId'],
    });
    let accountIds = sharedAccounts.map((a) => a.id);
    if (query.accountId) {
      if (!accountIds.includes(query.accountId)) {
        throw new BadRequestException('Account not found or not shared');
      }
      accountIds = [query.accountId];
    }
    if (accountIds.length === 0) return { items: [], total: 0 };

    const members = await this.memberRepo.find({
      where: { householdId: current.householdId },
      relations: ['user'],
    });
    const userMap = new Map(members.map((m) => [m.userId, m.user]));

    const qb = this.txRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.account', 'account')
      .where('t.accountId IN (:...accountIds)', { accountIds })
      .andWhere('t.deleted_at IS NULL');

    if (query.dateFrom) qb.andWhere('t.date >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('t.date <= :dateTo', { dateTo: query.dateTo });

    qb.orderBy('t.date', 'DESC').addOrderBy('t.createdAt', 'DESC');
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((t) => {
        const owner = userMap.get(t.account?.userId ?? '');
        return {
          id: t.id,
          accountId: t.accountId,
          categoryId: t.categoryId,
          category: t.category
            ? { id: t.category.id, name: t.category.name, type: t.category.type }
            : null,
          amount_minor: t.amountMinor,
          amount: toMoneyDto(t.amountMinor, t.currency),
          currency: t.currency,
          date: t.date,
          memo: t.memo,
          owner: {
            userId: t.account?.userId ?? owner?.id,
            name: owner?.name ?? owner?.email ?? null,
          },
        };
      }),
      total,
    };
  }

  /** Used by AccountsService to validate sharing */
  async userInHousehold(userId: string): Promise<boolean> {
    const m = await this.memberRepo.findOne({ where: { userId } });
    return Boolean(m);
  }
}
