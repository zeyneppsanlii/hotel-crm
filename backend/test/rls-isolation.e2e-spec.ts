import {
  asAppRoleNoContext,
  asTenant,
  closeAllPools,
  getAdminPool,
  resetDatabase,
} from './helpers/db';
import { SeededRows, seedRowInEachTable, seedTenant } from './helpers/fixtures';

// Every tenant-scoped table that must enforce RLS.
const TENANT_TABLES = [
  'users',
  'refresh_tokens',
  'guests',
  'conversations',
  'messages',
  'tickets',
  'devices',
  'device_alerts',
] as const;

// Proves PostgreSQL RLS actually isolates tenants — queried through the app role
// (hotelcrm_app), exactly as the running app connects. Data is seeded as the
// superuser. (HCRM-24: the sprint's most critical guarantee.)
describe('RLS tenant isolation (e2e)', () => {
  let alphaId: string;
  let betaId: string;
  let betaRows: SeededRows;

  beforeAll(async () => {
    await resetDatabase();
    alphaId = (await seedTenant({ name: 'Hotel Alpha', slug: 'rls-alpha' })).id;
    betaId = (await seedTenant({ name: 'Hotel Beta', slug: 'rls-beta' })).id;
    await seedRowInEachTable(alphaId);
    betaRows = await seedRowInEachTable(betaId);
  });

  afterAll(async () => {
    await closeAllPools();
  });

  describe('READ: a tenant context never returns another tenant’s rows', () => {
    it.each(TENANT_TABLES)('%s', async (table) => {
      const res = await asTenant(alphaId, (c) =>
        c.query<{ tenant_id: string }>(`SELECT tenant_id FROM "${table}"`),
      );
      expect(res.rowCount).toBeGreaterThan(0); // Alpha sees its own row
      expect(res.rows.every((r) => r.tenant_id === alphaId)).toBe(true); // never Beta
    });
  });

  it('WRITE (WITH CHECK): cannot insert a row stamped with another tenant', async () => {
    await expect(
      asTenant(alphaId, (c) =>
        c.query(
          `INSERT INTO guests (id, tenant_id, full_name, phone, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'X', '000', now(), now())`,
          [betaId], // Beta's id while in Alpha context -> policy violation
        ),
      ),
    ).rejects.toThrow();
  });

  it('UPDATE: touching another tenant’s row by id affects zero rows', async () => {
    const res = await asTenant(alphaId, (c) =>
      c.query(`UPDATE guests SET notes = 'hacked' WHERE id = $1`, [
        betaRows.guests,
      ]),
    );
    expect(res.rowCount).toBe(0); // Beta's guest is invisible to Alpha

    // Ground truth (superuser): Beta's row is untouched.
    const check = await getAdminPool().query<{ notes: string | null }>(
      `SELECT notes FROM guests WHERE id = $1`,
      [betaRows.guests],
    );
    expect(check.rows[0].notes).not.toBe('hacked');
  });

  it('NO CONTEXT: querying without a tenant set returns zero rows (safe default)', async () => {
    const res = await asAppRoleNoContext((c) =>
      c.query(`SELECT * FROM guests`),
    );
    expect(res.rowCount).toBe(0);
  });

  describe('FORCE RLS is enabled (so even the table owner is subject to policies)', () => {
    it.each(TENANT_TABLES)('%s', async (table) => {
      const res = await getAdminPool().query<{
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1`,
        [table],
      );
      expect(res.rows[0].relrowsecurity).toBe(true);
      expect(res.rows[0].relforcerowsecurity).toBe(true);
    });
  });

  it('POOL SAFETY: sequential different-tenant ops never leak context', async () => {
    const a = await asTenant(alphaId, (c) =>
      c.query<{ tenant_id: string }>(`SELECT tenant_id FROM guests`),
    );
    const b = await asTenant(betaId, (c) =>
      c.query<{ tenant_id: string }>(`SELECT tenant_id FROM guests`),
    );
    expect(a.rows.every((r) => r.tenant_id === alphaId)).toBe(true);
    expect(b.rows.every((r) => r.tenant_id === betaId)).toBe(true);
  });
});
