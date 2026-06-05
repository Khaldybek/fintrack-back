import { Client } from 'pg';

export async function runHouseholdBudgetsMigration(): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS household_budgets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        name varchar(100) NOT NULL,
        category_name varchar(100) NOT NULL,
        limit_minor integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'KZT',
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_household_budgets_household_id
        ON household_budgets(household_id)
    `);
  } finally {
    await client.end();
  }
}
