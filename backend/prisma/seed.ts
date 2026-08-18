import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ROLE_DEFAULT_PERMISSIONS, Role } from '../src/auth/permissions';

/**
 * Local bootstrap seed (HCRM-28). Brings a fresh machine to a data-filled dev
 * environment in one command: two demo hotels, each with an admin/manager/staff
 * user, plus sample guests, a conversation with messages, and tickets — so tenant
 * isolation can be tried by hand and feature work has realistic data.
 *
 * Runs as the SUPERUSER (DIRECT_DATABASE_URL), which bypasses RLS — this is an
 * admin/ops task that legitimately writes across tenants. The app runtime never
 * connects this way. Fully idempotent: every row is upserted by a fixed id (or a
 * natural key), so re-running neither duplicates data nor errors.
 *
 * Identity model note: one user belongs to exactly one tenant. There is
 * intentionally NO single account spanning both hotels — a person working at two
 * hotels would have two separate accounts.
 */
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
});

interface DemoHotel {
  id: string;
  name: string;
  slug: string;
  /** Single hex char used to derive deterministic ids for this hotel's rows. */
  prefix: string;
  emailDomain: string;
}

const HOTELS: DemoHotel[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Deniz Otel',
    slug: 'deniz-otel',
    prefix: 'a',
    emailDomain: 'deniz.test',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Dağ Resort',
    slug: 'dag-resort',
    prefix: 'b',
    emailDomain: 'dag.test',
  },
];

/** Deterministic, valid UUID for a demo row: `<prefix><kind>...<nn>`. */
function demoId(prefix: string, kind: number, n: number): string {
  const nn = String(n).padStart(2, '0');
  return `${prefix}${kind}000000-0000-4000-8000-0000000000${nn}`;
}

async function upsertTenant(hotel: DemoHotel) {
  return prisma.tenant.upsert({
    where: { id: hotel.id },
    update: { name: hotel.name, slug: hotel.slug, status: 'active' },
    create: { id: hotel.id, name: hotel.name, slug: hotel.slug },
  });
}

async function upsertUser(input: {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: Role;
}) {
  const passwordHash = await bcrypt.hash('admin1234', 10);
  return prisma.user.upsert({
    where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
    update: {
      role: input.role,
      permissions: ROLE_DEFAULT_PERMISSIONS[input.role],
      fullName: input.fullName,
    },
    create: {
      id: input.id,
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      permissions: ROLE_DEFAULT_PERMISSIONS[input.role],
    },
  });
}

async function seedHotel(hotel: DemoHotel): Promise<void> {
  await upsertTenant(hotel);

  // One user in each of the three roles, so RBAC can be exercised. The admin is
  // created but not referenced further, so it is not captured.
  await upsertUser({
    id: demoId(hotel.prefix, 9, 1),
    tenantId: hotel.id,
    email: `admin@${hotel.emailDomain}`,
    fullName: `${hotel.name} Admin`,
    role: 'admin',
  });
  const manager = await upsertUser({
    id: demoId(hotel.prefix, 9, 2),
    tenantId: hotel.id,
    email: `manager@${hotel.emailDomain}`,
    fullName: `${hotel.name} Manager`,
    role: 'manager',
  });
  const staff = await upsertUser({
    id: demoId(hotel.prefix, 9, 3),
    tenantId: hotel.id,
    email: `staff@${hotel.emailDomain}`,
    fullName: `${hotel.name} Staff`,
    role: 'staff',
  });

  // A couple of guests.
  const guest = await prisma.guest.upsert({
    where: { id: demoId(hotel.prefix, 0, 1) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 0, 1),
      tenantId: hotel.id,
      fullName: 'Ayşe Yılmaz',
      phone: '+905550000001',
      roomNumber: '101',
      status: 'checked_in',
    },
  });
  await prisma.guest.upsert({
    where: { id: demoId(hotel.prefix, 0, 2) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 0, 2),
      tenantId: hotel.id,
      fullName: 'Mehmet Demir',
      phone: '+905550000002',
      roomNumber: '205',
      status: 'checked_out',
    },
  });

  // A conversation for the first guest, handled by the staff member, with two
  // messages (one inbound from the guest, one reply from staff).
  const conversation = await prisma.conversation.upsert({
    where: { id: demoId(hotel.prefix, 1, 1) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 1, 1),
      tenantId: hotel.id,
      guestId: guest.id,
      assignedTo: staff.id,
      status: 'active',
      lastMessageAt: new Date(),
    },
  });
  await prisma.message.upsert({
    where: { id: demoId(hotel.prefix, 2, 1) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 2, 1),
      tenantId: hotel.id,
      conversationId: conversation.id,
      senderType: 'guest',
      content: 'Merhaba, odada havlu kalmamış.',
    },
  });
  await prisma.message.upsert({
    where: { id: demoId(hotel.prefix, 2, 2) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 2, 2),
      tenantId: hotel.id,
      conversationId: conversation.id,
      senderType: 'staff',
      senderId: staff.id,
      content: 'Hemen gönderiyoruz, kusura bakmayın.',
    },
  });

  // Two tickets: one open (assigned to the manager), one already resolved.
  await prisma.ticket.upsert({
    where: { id: demoId(hotel.prefix, 3, 1) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 3, 1),
      tenantId: hotel.id,
      guestId: guest.id,
      conversationId: conversation.id,
      category: 'housekeeping',
      priority: 'high',
      status: 'pending',
      title: 'Odaya havlu talebi',
      roomNumber: '101',
      assignedTo: manager.id,
    },
  });
  await prisma.ticket.upsert({
    where: { id: demoId(hotel.prefix, 3, 2) },
    update: {},
    create: {
      id: demoId(hotel.prefix, 3, 2),
      tenantId: hotel.id,
      category: 'maintenance',
      priority: 'medium',
      status: 'resolved',
      title: 'Klima çalışmıyor',
      roomNumber: '205',
      resolvedAt: new Date(),
      resolutionNotes: 'Kompresör değişti.',
    },
  });
}

async function main() {
  for (const hotel of HOTELS) {
    await seedHotel(hotel);
  }
  console.log(
    `Seeded ${HOTELS.length} hotels (${HOTELS.map((h) => h.name).join(', ')}) ` +
      `with admin/manager/staff users, guests, conversations and tickets. ` +
      `Password for all users: admin1234`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
