import { Client } from 'pg';

export async function runStatementImportMigration(): Promise<void> {
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
      CREATE TABLE IF NOT EXISTS statement_imports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL DEFAULT 'preview',
        bank_code varchar(32) NOT NULL DEFAULT 'generic',
        bank_confidence numeric(4,3) NOT NULL DEFAULT 0,
        file_name varchar(255) NOT NULL,
        file_format varchar(10) NOT NULL,
        period_from date,
        period_to date,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        confirmed_at timestamptz
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS statement_import_rows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        import_id uuid NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
        row_index integer NOT NULL,
        date date NOT NULL,
        amount_minor integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'KZT',
        memo text,
        category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
        suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
        selected boolean NOT NULL DEFAULT true,
        is_duplicate boolean NOT NULL DEFAULT false,
        fingerprint varchar(64) NOT NULL,
        transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
        raw jsonb,
        parse_warning text
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_statement_import_rows_import_id
        ON statement_import_rows(import_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_statement_imports_user_id
        ON statement_imports(user_id)
    `);
  } finally {
    await client.end();
  }
}
