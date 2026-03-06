import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  enabled: process.env.AI_ENABLED !== 'false',
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  timeoutMs: Math.min(15000, Math.max(5000, parseInt(process.env.OPENAI_TIMEOUT_MS ?? '12000', 10) || 12000)),
}));
