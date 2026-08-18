import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { closeAdminPool, resetDatabase } from './helpers/db';
import { FIXTURE_PASSWORD, seedTwoTenants } from './helpers/fixtures';

interface LoginBody {
  data: { accessToken: string };
}
interface MeBody {
  data: { tenantId: string; email: string };
}

// Proves the global TenantGuard (HCRM-25): a token is only valid for the tenant
// it was issued for. Pairing a valid Alpha token with another tenant's
// x-tenant-id header is a cross-tenant attempt and is rejected before any query
// runs — defence-in-depth above RLS. /auth/me is used as the probe because it
// needs only authentication (no extra permission), isolating the tenant check.
describe('TenantGuard cross-tenant enforcement (e2e)', () => {
  let app: INestApplication<App>;
  let ctx: Awaited<ReturnType<typeof seedTwoTenants>>;
  let alphaToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    await resetDatabase();
    ctx = await seedTwoTenants();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', ctx.alpha.id)
      .send({ email: 'admin@alpha.test', password: FIXTURE_PASSWORD });
    expect(login.status).toBe(200);
    alphaToken = (login.body as LoginBody).data.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await closeAdminPool();
  });

  it('allows the token when the x-tenant-id header matches its tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('x-tenant-id', ctx.alpha.id)
      .set('Authorization', `Bearer ${alphaToken}`);

    expect(res.status).toBe(200);
    expect((res.body as MeBody).data.tenantId).toBe(ctx.alpha.id);
    expect((res.body as MeBody).data.email).toBe('admin@alpha.test');
  });

  it("rejects an Alpha token paired with Beta's x-tenant-id header (403)", async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('x-tenant-id', ctx.beta.id)
      .set('Authorization', `Bearer ${alphaToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects an authenticated request that omits the x-tenant-id header (400)', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${alphaToken}`);

    expect(res.status).toBe(400);
  });

  it('does not block @Public() login (guard is skipped there)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-tenant-id', ctx.alpha.id)
      .send({ email: 'admin@alpha.test', password: FIXTURE_PASSWORD });

    expect(res.status).toBe(200);
  });
});
