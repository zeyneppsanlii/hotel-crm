import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { toTenantId } from '../common/tenant/tenant.types';
import { toUserEmail } from '../users/types/user.types';
import { LoginAttemptsRepository } from './login-attempts.repository';
import { LoginThrottleService } from './login-throttle.service';
import { LoginAttemptIdentity, toClientIp } from './types/login-attempt.types';

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 900;

const identityFor = (
  email: string,
  ip = '203.0.113.10',
  tenant = 'tenant-1',
): LoginAttemptIdentity => ({
  tenantId: toTenantId(tenant),
  email: toUserEmail(email),
  ip: toClientIp(ip),
});

class InMemoryLoginAttemptsRepository {
  readonly counters = new Map<string, number>();
  readonly ttls = new Map<string, number>();

  count(identity: LoginAttemptIdentity): Promise<number> {
    return Promise.resolve(this.counters.get(this.key(identity)) ?? 0);
  }

  increment(
    identity: LoginAttemptIdentity,
    windowSeconds: number,
  ): Promise<number> {
    const key = this.key(identity);
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    if (!this.ttls.has(key)) {
      this.ttls.set(key, windowSeconds);
    }
    return Promise.resolve(next);
  }

  startLockout(
    identity: LoginAttemptIdentity,
    lockoutSeconds: number,
  ): Promise<void> {
    this.ttls.set(this.key(identity), lockoutSeconds);
    return Promise.resolve();
  }

  clear(identity: LoginAttemptIdentity): Promise<void> {
    const key = this.key(identity);
    this.counters.delete(key);
    this.ttls.delete(key);
    return Promise.resolve();
  }

  key(identity: LoginAttemptIdentity): string {
    return `${identity.tenantId}:${identity.email.toLowerCase()}:${identity.ip}`;
  }
}

describe('LoginThrottleService', () => {
  let repository: InMemoryLoginAttemptsRepository;
  let service: LoginThrottleService;

  const failTimes = async (
    identity: LoginAttemptIdentity,
    times: number,
  ): Promise<void> => {
    for (let i = 0; i < times; i++) {
      await service.recordFailure(identity);
    }
  };

  beforeEach(() => {
    repository = new InMemoryLoginAttemptsRepository();
    const config = {
      get: jest.fn((key: string) =>
        key === 'LOGIN_MAX_ATTEMPTS' ? MAX_ATTEMPTS : LOCKOUT_SECONDS,
      ),
    } as unknown as ConfigService;
    service = new LoginThrottleService(
      repository as unknown as LoginAttemptsRepository,
      config,
    );
  });

  it('allows attempts below the threshold', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS - 1);

    await expect(service.assertNotLocked(identity)).resolves.toBeUndefined();
  });

  it('locks once the threshold is reached', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS);

    await expect(service.assertNotLocked(identity)).rejects.toThrow(
      HttpException,
    );
  });

  it('answers a locked identity with 429', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS);

    await expect(service.assertNotLocked(identity)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('gives the full lockout window when the threshold is crossed', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS);

    expect(repository.ttls.get(repository.key(identity))).toBe(LOCKOUT_SECONDS);
  });

  it('resets the counter on a successful login', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS);

    await service.reset(identity);

    await expect(service.assertNotLocked(identity)).resolves.toBeUndefined();
  });

  it('keeps a separate budget per email', async () => {
    await failTimes(identityFor('ayse@otel.test'), MAX_ATTEMPTS);

    await expect(
      service.assertNotLocked(identityFor('mehmet@otel.test')),
    ).resolves.toBeUndefined();
  });

  it('keeps a separate budget per IP', async () => {
    await failTimes(
      identityFor('ayse@otel.test', '203.0.113.10'),
      MAX_ATTEMPTS,
    );

    await expect(
      service.assertNotLocked(identityFor('ayse@otel.test', '198.51.100.7')),
    ).resolves.toBeUndefined();
  });

  it('does not let one tenant lock out the same email in another tenant', async () => {
    await failTimes(
      identityFor('ayse@otel.test', '203.0.113.10', 'tenant-1'),
      MAX_ATTEMPTS,
    );

    await expect(
      service.assertNotLocked(
        identityFor('ayse@otel.test', '203.0.113.10', 'tenant-2'),
      ),
    ).resolves.toBeUndefined();
  });

  it('treats the email case-insensitively so casing cannot buy extra attempts', async () => {
    await failTimes(identityFor('ayse@otel.test'), MAX_ATTEMPTS);

    await expect(
      service.assertNotLocked(identityFor('AYSE@OTEL.TEST')),
    ).rejects.toThrow(HttpException);
  });

  it('does not name the account in the lock message', async () => {
    const identity = identityFor('ayse@otel.test');
    await failTimes(identity, MAX_ATTEMPTS);

    await expect(service.assertNotLocked(identity)).rejects.toThrow(
      /^(?!.*ayse@otel\.test).*$/,
    );
  });
});
