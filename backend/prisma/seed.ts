import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_DEFAULT_PERMISSIONS, PERMISSIONS } from '../src/auth/permissions';

/**
 * Bootstrap seed. Creates the first users for the two dev tenants so login can be
 * tested (the create-user endpoint itself requires an authenticated admin, so the
 * very first account cannot be made through the API).
 *
 * Runs as the SUPERUSER (DIRECT_DATABASE_URL), which bypasses RLS — this is an
 * admin/ops task that legitimately writes across tenants. The app runtime never
 * connects this way.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

const ALPHA = '11111111-1111-1111-1111-111111111111';
const BETA = '22222222-2222-2222-2222-222222222222';

async function upsertUser(user: {
  tenantId: string;
  email: string;
  fullName: string;
  role: 'admin' | 'manager' | 'staff';
  permissions: string[];
}) {
  const passwordHash = await bcrypt.hash('admin1234', 10);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: user.tenantId, email: user.email } },
    update: {
      role: user.role,
      permissions: user.permissions,
      fullName: user.fullName,
    },
    create: {
      tenantId: user.tenantId,
      email: user.email,
      passwordHash,
      fullName: user.fullName,
      role: user.role,
      permissions: user.permissions,
    },
  });
}

async function main() {
  // Alpha: an admin + a limited staff member (view-only guests) to show that two
  // users in the same tenant can hold different permissions.
  await upsertUser({
    tenantId: ALPHA,
    email: 'admin@alpha.com',
    fullName: 'Alpha Admin',
    role: 'admin',
    permissions: ROLE_DEFAULT_PERMISSIONS.admin,
  });
  await upsertUser({
    tenantId: ALPHA,
    email: 'staff@alpha.com',
    fullName: 'Alpha Staff',
    role: 'staff',
    permissions: [PERMISSIONS.GUESTS_VIEW],
  });
  // Beta: one admin.
  await upsertUser({
    tenantId: BETA,
    email: 'admin@beta.com',
    fullName: 'Beta Admin',
    role: 'admin',
    permissions: ROLE_DEFAULT_PERMISSIONS.admin,
  });

  console.log('Seeded users. Password for all: admin1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
