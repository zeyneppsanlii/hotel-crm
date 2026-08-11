import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface Envelope {
  success: boolean;
  data: unknown;
  error?: { code: string; message: string; details?: unknown };
  meta: { timestamp: string; requestId?: string };
}

// Verifies the standard response contract (HCRM-21): success/error envelope,
// x-request-id, validation-error mapping. These paths need no seeded data — they
// exercise the health route, the auth guard, validation, and the 404 handler.
describe('Response contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps success in the envelope and sets x-request-id', async () => {
    const res = await request(app.getHttpServer()).get('/');
    const body = res.body as Envelope;
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBe('Hello World!');
    expect(typeof body.meta.timestamp).toBe('string');
    expect(body.meta.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reuses an incoming x-request-id', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('x-request-id', 'test-req-123');
    const body = res.body as Envelope;
    expect(body.meta.requestId).toBe('test-req-123');
    expect(res.headers['x-request-id']).toBe('test-req-123');
  });

  it('returns the error envelope for auth failures (401)', async () => {
    const res = await request(app.getHttpServer()).get('/users');
    const body = res.body as Envelope;
    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('UNAUTHORIZED');
    expect(body.meta.requestId).toBeTruthy();
  });

  it('returns a validation error envelope (400) with details', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email' }); // bad email + missing password
    const body = res.body as Envelope;
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.error?.details)).toBe(true);
  });

  it('returns a 404 error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist');
    const body = res.body as Envelope;
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
