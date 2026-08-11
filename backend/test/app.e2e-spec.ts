import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) returns the success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/');
    const body = res.body as { success: boolean; data: unknown };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBe('Hello World!');
  });
});
