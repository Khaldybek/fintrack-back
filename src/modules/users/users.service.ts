import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User } from './entities/user.entity';

export interface CreateUserByEmailDto {
  email: string;
  password: string;
  name?: string;
}

export interface CreateUserByGoogleDto {
  googleId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { googleId } });
  }

  async createByEmail(dto: CreateUserByEmailDto): Promise<User> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = this.userRepo.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      name: dto.name ?? null,
      googleId: null,
    });
    return this.userRepo.save(user);
  }

  async createOrFindByGoogle(dto: CreateUserByGoogleDto): Promise<User> {
    let user = await this.findByGoogleId(dto.googleId);
    if (user) return user;
    user = await this.findByEmail(dto.email);
    if (user) {
      user.googleId = dto.googleId;
      user.name = dto.name ?? user.name;
      user.avatarUrl = dto.avatarUrl ?? user.avatarUrl;
      return this.userRepo.save(user);
    }
    const newUser = this.userRepo.create({
      email: dto.email.toLowerCase(),
      googleId: dto.googleId,
      name: dto.name ?? null,
      avatarUrl: dto.avatarUrl ?? null,
      passwordHash: null,
    });
    return this.userRepo.save(newUser);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return argon2.verify(user.passwordHash, password);
  }

  async setPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await argon2.hash(newPassword);
    await this.userRepo.save(user);
  }

  async update(
    userId: string,
    dto: { name?: string | null; timezone?: string; locale?: string; avatarUrl?: string | null },
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.timezone !== undefined) user.timezone = dto.timezone;
    if (dto.locale !== undefined) user.locale = dto.locale;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    return this.userRepo.save(user);
  }
}
