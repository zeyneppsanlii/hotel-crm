import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthCheckResult } from './types/health-status.types';

/**
 * Reports whether the app and its dependencies (Postgres, Redis) are reachable.
 * Each dependency check is isolated and never throws, so the endpoint can report
 * a partial outage instead of failing outright.
 */
@Injectable()
export class HealthService {
  private readonly version = this.readVersion();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      this.redis.ping(),
    ]);

    return {
      status: postgres && redis ? 'ok' : 'error',
      uptime: Math.floor(process.uptime()),
      version: this.version,
      timestamp: new Date().toISOString(),
      checks: {
        postgres: postgres ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private readVersion(): string {
    try {
      const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
      return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
