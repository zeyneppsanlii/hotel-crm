import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { LoginAttemptIdentity } from './types/login-attempt.types';

const KEY_PREFIX = 'login-attempts';

@Injectable()
export class LoginAttemptsRepository {
  constructor(private readonly redis: RedisService) {}

  count(identity: LoginAttemptIdentity): Promise<number> {
    return this.redis.count(this.keyFor(identity));
  }

  increment(
    identity: LoginAttemptIdentity,
    windowSeconds: number,
  ): Promise<number> {
    return this.redis.incrementWithTtl(this.keyFor(identity), windowSeconds);
  }

  startLockout(
    identity: LoginAttemptIdentity,
    lockoutSeconds: number,
  ): Promise<void> {
    return this.redis.resetTtl(this.keyFor(identity), lockoutSeconds);
  }

  clear(identity: LoginAttemptIdentity): Promise<void> {
    return this.redis.delete(this.keyFor(identity));
  }

  private keyFor(identity: LoginAttemptIdentity): string {
    return `${KEY_PREFIX}:${identity.tenantId}:${identity.email.toLowerCase()}:${identity.ip}`;
  }
}
