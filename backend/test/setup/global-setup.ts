import { execSync } from 'child_process';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';

/** Strip the `?schema=` query — node-pg doesn't understand it. */
function toPgUrl(connectionString: string): { url: string; dbName: string } {
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.slice(1);
  parsed.search = '';
  return { url: parsed.toString(), dbName };
}

async function createDatabaseIfMissing(
  adminUrl: string,
  dbName: string,
): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

/**
 * Prepares the test database ONCE before the whole e2e run:
 *   1. create hotel_crm_test if it doesn't exist,
 *   2. run migrations (tables + RLS policies) as the superuser,
 *   3. provision the non-superuser app role + grants (reuses the docker init SQL).
 * Idempotent, so it's safe to run repeatedly (local) or on a fresh DB (CI).
 */
export default async function globalSetup(): Promise<void> {
  config({ path: resolve(__dirname, '../../.env.test'), override: true });

  const direct = process.env.DIRECT_DATABASE_URL;
  if (!direct) {
    throw new Error('DIRECT_DATABASE_URL is not set for tests (.env.test)');
  }

  const { url: directPgUrl, dbName } = toPgUrl(direct);
  const adminUrl = new URL(directPgUrl);
  adminUrl.pathname = '/postgres'; // maintenance DB to run CREATE DATABASE

  // 1) test database
  await createDatabaseIfMissing(adminUrl.toString(), dbName);

  // 2) migrations (Prisma reads DIRECT_DATABASE_URL via directUrl)
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    stdio: 'inherit',
    env: { ...process.env },
  });

  // 3) app role + grants on the test DB
  const roleSql = readFileSync(
    resolve(__dirname, '../../../docker/postgres/init/01-app-role.sql'),
    'utf8',
  );
  const admin = new Client({ connectionString: directPgUrl });
  await admin.connect();
  try {
    await admin.query(roleSql);
  } finally {
    await admin.end();
  }
}
