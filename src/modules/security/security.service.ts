import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { SecurityEvent } from './entities/security-event.entity';

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(SecurityEvent)
    private readonly eventRepo: Repository<SecurityEvent>,
  ) {}

  async getSessions(userId: string) {
    const list = await this.refreshRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    return list
      .filter((r) => r.expiresAt > now)
      .map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      }));
  }

  async revokeSession(id: string, userId: string) {
    const r = await this.refreshRepo.findOne({ where: { id, userId } });
    if (!r) throw new NotFoundException('Session not found');
    await this.refreshRepo.remove(r);
  }

  async getEvents(userId: string, limit = 50) {
    const list = await this.eventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return list.map((e) => ({
      id: e.id,
      type: e.type,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async logEvent(userId: string, type: string, metadata?: Record<string, unknown>) {
    const e = this.eventRepo.create({ userId, type, metadata: metadata ?? null });
    await this.eventRepo.save(e);
  }
}
