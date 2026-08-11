import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface HealthBody {
  status: string;
  uptime: number;
  version: string;
  checks: { postgres: string; redis: string };
}

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and reports dependency status', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    const body = res.body as HealthBody;
    // 200 when all up, 503 when a dependency is down.
    expect([200, 503]).toContain(res.status);
    // Raw payload — intentionally NOT wrapped in the standard response envelope.
    expect(body.checks.postgres).toBe('up'); // DB must be up for the suite to run
    expect(['up', 'down']).toContain(body.checks.redis);
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });
});
