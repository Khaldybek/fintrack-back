import { Client } from 'pg';

/**
 * Adds optional amount_minor column for salary schedules.
 * Safe to run on each startup.
 */
export async function runSalarySchedulesAmountMigration(): Promise<void> {
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
      ALTER TABLE salary_schedules
      ADD COLUMN IF NOT EXISTS amount_minor integer
    `);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('relation "salary_schedules" does not exist')) return;
    if (msg.includes('does not exist')) return;
    throw err;
  } finally {
    await client.end();
  }
}
