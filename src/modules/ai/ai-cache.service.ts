import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiContentCache } from './entities/ai-content-cache.entity';
import { fingerprintHash } from './ai-cache.util';

@Injectable()
export class AiCacheService {
  constructor(
    @InjectRepository(AiContentCache)
    private readonly repo: Repository<AiContentCache>,
  ) {}

  /**
   * Returns cached payload if context fingerprint matches; otherwise runs generate(),
   * stores result, and returns it. Skips DB write when generate returns null.
   */
  async getOrSetPayload<T extends Record<string, unknown>>(
    userId: string,
    feature: string,
    periodKey: string,
    fingerprint: unknown,
    generate: () => Promise<T | null>,
  ): Promise<T | null> {
    const contextHash = fingerprintHash(fingerprint);
    const existing = await this.repo.findOne({
      where: { userId, feature, periodKey },
    });
    if (existing && existing.contextHash === contextHash) {
      return existing.payload as T;
    }
    const fresh = await generate();
    if (!fresh) return null;
    await this.repo.query(
      `INSERT INTO ai_content_cache (user_id, feature, period_key, context_hash, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now(), now())
       ON CONFLICT (user_id, feature, period_key)
       DO UPDATE SET context_hash = EXCLUDED.context_hash, payload = EXCLUDED.payload, updated_at = now()`,
      [userId, feature, periodKey, contextHash, JSON.stringify(fresh)],
    );
    return fresh;
  }
}
