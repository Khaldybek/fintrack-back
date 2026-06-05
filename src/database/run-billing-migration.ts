import { Client } from 'pg';

/**
 * Billing tables for mock SaaS checkout (FinTrack Pro / Family).
 */
export async function runBillingMigration(): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS user_billing_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(32) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'active',
        current_period_start date NOT NULL,
        current_period_end date NOT NULL,
        cancel_at_period_end boolean NOT NULL DEFAULT false,
        payment_method_last4 varchar(4),
        payment_method_brand varchar(20),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_code varchar(32) NOT NULL,
        amount_minor integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'KZT',
        status varchar(20) NOT NULL DEFAULT 'pending',
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_user
      ON billing_checkout_sessions (user_id, status)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        checkout_session_id uuid REFERENCES billing_checkout_sessions(id) ON DELETE SET NULL,
        plan_code varchar(32) NOT NULL,
        amount_minor integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'KZT',
        status varchar(20) NOT NULL,
        description varchar(200) NOT NULL,
        mock_card_brand varchar(20),
        mock_card_last4 varchar(4),
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_invoices_user
      ON billing_invoices (user_id, created_at DESC)
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
