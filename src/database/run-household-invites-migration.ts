import { Client } from 'pg';

export async function runHouseholdInvitesMigration(): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS household_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        email varchar(255) NOT NULL,
        role varchar(20) NOT NULL,
        token_hash varchar(64) NOT NULL,
        invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_household_invites_pending_email
        ON household_invites(household_id, email)
        WHERE status = 'pending'
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_household_invites_token_hash
        ON household_invites(token_hash)
    `);
  } finally {
    await client.end();
  }
}
