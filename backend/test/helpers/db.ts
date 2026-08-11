import { Pool } from 'pg';

let pool: Pool | undefined;

/**
 * A SUPERUSER connection pool for test setup (fixtures + truncation). Being a
 * superuser it bypasses RLS, so tests can seed and wipe any tenant's data
 * directly — the app under test still connects as the restricted role.
 */
export function getAdminPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DIRECT_DATABASE_URL;
    if (!connectionString) {
      throw new Error('DIRECT_DATABASE_URL is not set for tests (.env.test)');
    }
    const url = new URL(connectionString);
    url.search = ''; // node-pg doesn't understand ?schema=
    pool = new Pool({ connectionString: url.toString() });
  }
  return pool;
}

const TABLES = [
  'tenants',
  'users',
  'guests',
  'conversations',
  'messages',
  'tickets',
  'devices',
  'device_alerts',
];

/** Wipe all data so each test file starts from a clean slate. */
export async function resetDatabase(): Promise<void> {
  const quoted = TABLES.map((t) => `"${t}"`).join(', ');
  await getAdminPool().query(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

export async function closeAdminPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
