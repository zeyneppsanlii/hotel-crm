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

export async function seedUser(input: SeedUserInput): Promise<SeededUser> {
  const passwordHash = await bcrypt.hash(
    input.password ?? FIXTURE_PASSWORD,
    10,
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
