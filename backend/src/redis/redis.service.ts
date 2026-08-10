import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin wrapper around a single ioredis client. For now it only powers the health
 * check, but the client is here to be reused later (queues, caching).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    // Swallow connection errors here — they surface deliberately via `ping()`.
    this.client.on('error', (err) =>
      this.logger.debug(`Redis connection error: ${err.message}`),
    );
  }

  /** True if Redis answers PING within the timeout; never throws. */
  async ping(timeoutMs = 2000): Promise<boolean> {
    try {
      const pong = await Promise.race([
        this.client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs),
        ),
      ]);
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
