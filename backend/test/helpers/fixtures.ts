import * as bcrypt from 'bcrypt';
import { getAdminPool } from './db';

export interface SeededTenant {
  id: string;
  name: string;
  slug: string;
}

export interface SeededUser {
  id: string;
  email: string;
  tenantId: string;
}

export interface SeedUserInput {
  tenantId: string;
  email: string;
  fullName?: string;
  role?: 'admin' | 'manager' | 'staff';
  permissions?: string[];
  password?: string;
}

/** Default password for seeded users, so tests can log them in. */
export const FIXTURE_PASSWORD = 'test1234';

export async function seedTenant(input: {
  name: string;
  slug: string;
}): Promise<SeededTenant> {
  const res = await getAdminPool().query<SeededTenant>(
    `INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'active', now(), now())
     RETURNING id, name, slug`,
    [input.name, input.slug],
  );
  return res.rows[0];
}

/**
 * Deliberately hashes at cost 10, NOT the app's BCRYPT_ROUNDS (12). Two reasons:
 * it keeps the suite fast (bcrypt 12 costs ~4x per user seeded), and it makes the
 * tests exercise the real-world case where stored hashes predate a cost increase —
 * bcrypt reads the cost from the hash, so login must verify them either way.
 */
const FIXTURE_BCRYPT_ROUNDS = 10;

export async function seedUser(input: SeedUserInput): Promise<SeededUser> {
  const passwordHash = await bcrypt.hash(
    input.password ?? FIXTURE_PASSWORD,
    FIXTURE_BCRYPT_ROUNDS,
  );
  const res = await getAdminPool().query<SeededUser>(
    `INSERT INTO users
       (id, tenant_id, email, password_hash, full_name, role, permissions, is_active, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, now(), now())
     RETURNING id, email, tenant_id AS "tenantId"`,
    [
      input.tenantId,
      input.email,
      passwordHash,
      input.fullName ?? 'Test User',
      input.role ?? 'staff',
      input.permissions ?? [],
    ],
  );
  return res.rows[0];
}

/** Two hotels, each with an admin — the common starting point for isolation tests. */
export async function seedTwoTenants() {
  const alpha = await seedTenant({ name: 'Hotel Alpha', slug: 'alpha' });
  const beta = await seedTenant({ name: 'Hotel Beta', slug: 'beta' });
  const alphaAdmin = await seedUser({
    tenantId: alpha.id,
    email: 'admin@alpha.test',
    role: 'admin',
    permissions: ['users:manage'],
  });
  const betaAdmin = await seedUser({
    tenantId: beta.id,
    email: 'admin@beta.test',
    role: 'admin',
    permissions: ['users:manage'],
  });
  return { alpha, beta, alphaAdmin, betaAdmin };
}

/** One row's id in every tenant-scoped table, for a single tenant. */
export interface SeededRows {
  users: string;
  guests: string;
  conversations: string;
  messages: string;
  tickets: string;
  devices: string;
  deviceAlerts: string;
}

/**
 * Inserts one row into every tenant-scoped table for `tenantId`, via the superuser
 * pool (bypasses RLS). Gives the isolation tests real data to try (and fail) to
 * reach across tenants. Returns each row's id.
 */
export async function seedRowInEachTable(
  tenantId: string,
): Promise<SeededRows> {
  const pool = getAdminPool();
  const insert = async (sql: string, params: unknown[]): Promise<string> => {
    const res = await pool.query<{ id: string }>(sql, params);
    return res.rows[0].id;
  };

  return {
    users: await insert(
      `INSERT INTO users (id, tenant_id, email, password_hash, full_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'hash', 'U', now(), now()) RETURNING id`,
      [tenantId, `rls-${tenantId}@x.test`],
    ),
    guests: await insert(
      `INSERT INTO guests (id, tenant_id, full_name, phone, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'G', '000', now(), now()) RETURNING id`,
      [tenantId],
    ),
    conversations: await insert(
      `INSERT INTO conversations (id, tenant_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, now(), now()) RETURNING id`,
      [tenantId],
    ),
    messages: await insert(
      `INSERT INTO messages (id, tenant_id, sender_type, content, created_at)
       VALUES (gen_random_uuid(), $1, 'guest', 'hi', now()) RETURNING id`,
      [tenantId],
    ),
    tickets: await insert(
      `INSERT INTO tickets (id, tenant_id, category, title, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'general', 'T', now(), now()) RETURNING id`,
      [tenantId],
    ),
    devices: await insert(
      `INSERT INTO devices (id, tenant_id, name, device_type, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'D', 'router', now(), now()) RETURNING id`,
      [tenantId],
    ),
    deviceAlerts: await insert(
      `INSERT INTO device_alerts (id, tenant_id, alert_type, message, created_at)
       VALUES (gen_random_uuid(), $1, 'cpu', 'high', now()) RETURNING id`,
      [tenantId],
    ),
  };
}
