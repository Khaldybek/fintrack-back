import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './entities/goal.entity';
import { GoalEntry } from './entities/goal-entry.entity';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { AddGoalEntryDto } from './dto/add-goal-entry.dto';
import { QueryGoalEntriesDto } from './dto/query-goal-entries.dto';
import { toMoneyDto } from '../../common/money.util';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';

const FREE_GOAL_LIMIT = 1;

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal)
    private readonly repo: Repository<Goal>,
    @InjectRepository(GoalEntry)
    private readonly entryRepo: Repository<GoalEntry>,
  ) {}

  async findAllByUser(userId: string) {
    const goals = await this.repo.find({
      where: { userId },
      order: { targetDate: 'ASC' },
    });
    return goals.map((g) => this.toResponse(g));
  }

  async findOne(id: string, userId: string) {
    const goal = await this.repo.findOne({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    return this.toResponse(goal);
  }

  async create(userId: string, dto: CreateGoalDto) {
    const count = await this.repo.count({ where: { userId } });
    if (count >= FREE_GOAL_LIMIT) {
      throw new FeatureGatedException(
        'goals_limit',
        'Upgrade to Pro to add more than 1 goal.',
      );
    }
    const goal = this.repo.create({
      userId,
      name: dto.name,
      targetMinor: dto.targetMinor,
      currentMinor: dto.currentMinor ?? 0,
      targetDate: dto.targetDate,
      currency: dto.currency ?? 'KZT',
    });
    const saved = await this.repo.save(goal);
    return this.toResponse(saved);
  }

  async update(id: string, userId: string, dto: UpdateGoalDto) {
    const goal = await this.repo.findOne({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.targetMinor !== undefined) goal.targetMinor = dto.targetMinor;
    if (dto.currentMinor !== undefined) goal.currentMinor = dto.currentMinor;
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate;
    if (dto.currency !== undefined) goal.currency = dto.currency;
    const saved = await this.repo.save(goal);
    return this.toResponse(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const goal = await this.repo.findOne({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    await this.repo.softRemove(goal);
  }

  async addEntry(goalId: string, userId: string, dto: AddGoalEntryDto) {
    const goal = await this.repo.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    if (dto.amountMinor === 0) throw new BadRequestException('amountMinor must not be zero');
    const current = Number(goal.currentMinor);
    const next = current + dto.amountMinor;
    if (next < 0) throw new BadRequestException('Resulting balance cannot be negative');
    const entry = this.entryRepo.create({
      goalId,
      amountMinor: dto.amountMinor,
      comment: dto.comment ?? null,
    });
    await this.entryRepo.save(entry);
    goal.currentMinor = next;
    await this.repo.save(goal);
    const savedGoal = await this.repo.findOne({ where: { id: goalId } });
    return {
      entry: this.entryToResponse(entry),
      goal: savedGoal ? this.toResponse(savedGoal) : undefined,
    };
  }

  async getEntries(goalId: string, userId: string, query: QueryGoalEntriesDto) {
    const goal = await this.repo.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const [items, total] = await this.entryRepo.findAndCount({
      where: { goalId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((e) => this.entryToResponse(e)),
      total,
      page,
      limit,
    };
  }

  async getAnalytics(goalId: string, userId: string) {
    const goal = await this.repo.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException('Goal not found');
    const entries = await this.entryRepo.find({
      where: { goalId },
      order: { createdAt: 'ASC' },
    });
    let totalAdded = 0;
    let totalWithdrawn = 0;
    const byMonth: Record<string, { added: number; withdrawn: number }> = {};
    for (const e of entries) {
      const amt = Number(e.amountMinor);
      const month = (e.createdAt as Date).toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { added: 0, withdrawn: 0 };
      if (amt > 0) {
        totalAdded += amt;
        byMonth[month].added += amt;
      } else {
        totalWithdrawn += -amt;
        byMonth[month].withdrawn += -amt;
      }
    }
    const currency = goal.currency;
    return {
      goalId,
      entriesCount: entries.length,
      totalAdded: toMoneyDto(totalAdded, currency),
      totalAdded_minor: totalAdded,
      totalWithdrawn: toMoneyDto(totalWithdrawn, currency),
      totalWithdrawn_minor: totalWithdrawn,
      byMonth: Object.entries(byMonth)
        .map(([month, v]) => ({
          month,
          added: toMoneyDto(v.added, currency),
          added_minor: v.added,
          withdrawn: toMoneyDto(v.withdrawn, currency),
          withdrawn_minor: v.withdrawn,
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  private entryToResponse(e: GoalEntry) {
    const amountMinor = typeof e.amountMinor === 'bigint' ? Number(e.amountMinor) : e.amountMinor;
    return {
      id: e.id,
      goalId: e.goalId,
      amountMinor,
      comment: e.comment,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private toResponse(goal: Goal) {
    const targetMinor = Number(goal.targetMinor);
    const currentMinor = Number(goal.currentMinor);
    const progressPercent = targetMinor > 0
      ? Math.min(100, Math.round((currentMinor / targetMinor) * 100))
      : 0;
    const isReached = currentMinor >= targetMinor;
    const severity = isReached ? 'good' : progressPercent >= 75 ? 'attention' : 'good';
    const status = isReached ? 'stable' : progressPercent >= 75 ? 'attention' : 'stable';
    const explanation = isReached
      ? 'Цель достигнута!'
      : `Накоплено ${progressPercent}% от цели.`;

    return {
      id: goal.id,
      name: goal.name,
      target: toMoneyDto(targetMinor, goal.currency),
      target_minor: targetMinor,
      current: toMoneyDto(currentMinor, goal.currency),
      current_minor: currentMinor,
      progress_percent: progressPercent,
      target_date: goal.targetDate,
      currency: goal.currency,
      severity,
      status,
      explanation,
    };
  }
}
