import { Client } from 'pg';

/**
 * Creates ai_content_cache for persistent AI response caching (Vercel-friendly).
 */
export async function runAiContentCacheMigration(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const config = url
    ? { connectionString: url }
    : {
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
        user: process.env.POSTGRES_USER ?? 'fintrack',
        password: process.env.POSTGRES_PASSWORD ?? 'fintrack_secret',
        database: process.env.POSTGRES_DB ?? 'fintrack',
      };

  const client = new Client(config);
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_content_cache (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feature varchar(64) NOT NULL,
        period_key varchar(64) NOT NULL,
        context_hash char(64) NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ai_content_cache_user_feature_period UNIQUE (user_id, feature, period_key)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_content_cache_user_feature
      ON ai_content_cache (user_id, feature)
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('relation "users" does not exist')) return;
    if (msg.includes('already exists')) return;
    throw err;
  } finally {
    await client.end();
  }
}
