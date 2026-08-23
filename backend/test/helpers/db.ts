import { Pool, PoolClient } from 'pg';

let adminPool: Pool | undefined;
let appPool: Pool | undefined;

function poolFromEnv(varName: 'DIRECT_DATABASE_URL' | 'DATABASE_URL'): Pool {
  const connectionString = process.env[varName];
  if (!connectionString) {
    throw new Error(`${varName} is not set for tests (.env.test)`);
  }
  const url = new URL(connectionString);
  url.search = ''; // node-pg doesn't understand ?schema=
  return new Pool({ connectionString: url.toString() });
}

/**
 * SUPERUSER pool (hotelcrm) — bypasses RLS. Used to seed/wipe any tenant's data
 * and to read "ground truth". The app under test never connects this way.
 */
export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = poolFromEnv('DIRECT_DATABASE_URL');
  }
  return adminPool;
}

/**
 * APP-ROLE pool (hotelcrm_app) — RLS IS enforced here, exactly like the running
 * app. Use `asTenant` / `asAppRoleNoContext` to run queries through it.
 */
export function getAppPool(): Pool {
  if (!appPool) {
    appPool = poolFromEnv('DATABASE_URL');
  }
  return appPool;
}

/**
 * Runs `fn` as the app role inside a transaction with `app.current_tenant_id` set
 * — exactly what TenantPrismaService does at runtime. Rolls back on error.
 */
export async function asTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
      tenantId,
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Runs `fn` as the app role with NO tenant context set (the "safe default" case). */
export async function asAppRoleNoContext<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getAppPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

const TABLES = [
  'tenants',
  'users',
  'refresh_tokens',
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
  if (adminPool) {
    await adminPool.end();
    adminPool = undefined;
  }
}

/** Close both pools — call in afterAll of files that use the app-role pool. */
export async function closeAllPools(): Promise<void> {
  await closeAdminPool();
  if (appPool) {
    await appPool.end();
    appPool = undefined;
  }
}
