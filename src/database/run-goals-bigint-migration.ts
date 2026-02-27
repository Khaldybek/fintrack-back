import { Client } from 'pg';

/**
 * Run before TypeORM synchronize. Changes goals.target_minor and current_minor from integer to bigint
 * so that TypeORM sync won't try (and fail) to DROP+ADD the columns.
 */
export async function runGoalsBigintMigration(): Promise<void> {
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
      ALTER TABLE goals
        ALTER COLUMN target_minor TYPE bigint USING target_minor::bigint,
        ALTER COLUMN current_minor TYPE bigint USING current_minor::bigint
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not exist') || msg.includes('relation "goals"')) return;
    if (msg.includes('type "bigint"')) return;
    throw err;
  } finally {
    await client.end();
  }
}
