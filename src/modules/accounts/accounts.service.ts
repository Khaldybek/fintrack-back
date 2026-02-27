import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { toMoneyDto } from '../../common/money.util';
import { FeatureGatedException } from '../../common/errors/feature-gated.exception';

const FREE_ACCOUNT_LIMIT = 3;

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  async countByUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  async findAllByUser(userId: string) {
    const accounts = await this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return accounts.map((a) => this.toResponse(a));
  }

  async findOne(id: string, userId: string): Promise<Account> {
    const account = await this.repo.findOne({ where: { id, userId } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async findOneResponse(id: string, userId: string) {
    const account = await this.findOne(id, userId);
    return this.toResponse(account);
  }

  async create(userId: string, dto: CreateAccountDto) {
    const count = await this.countByUser(userId);
    if (count >= FREE_ACCOUNT_LIMIT) {
      throw new FeatureGatedException(
        'accounts_limit',
        'Upgrade to Pro to add more than 3 accounts.',
      );
    }
    const account = this.repo.create({
      userId,
      name: dto.name,
      currency: dto.currency ?? 'KZT',
      balanceMinor: 0,
    });
    const saved = await this.repo.save(account);
    return this.toResponse(saved);
  }

  async update(id: string, userId: string, dto: UpdateAccountDto) {
    const account = await this.findOne(id, userId);
    if (dto.name !== undefined) account.name = dto.name;
    if (dto.currency !== undefined) account.currency = dto.currency;
    const saved = await this.repo.save(account);
    return this.toResponse(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const account = await this.findOne(id, userId);
    await this.repo.softRemove(account);
  }

  private toResponse(account: Account) {
    return {
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: toMoneyDto(Number(account.balanceMinor), account.currency),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}
