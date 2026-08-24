import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskEmail } from '../common/logging/mask-email';
import { LoginAttemptsRepository } from './login-attempts.repository';
import { LoginAttemptIdentity } from './types/login-attempt.types';

const LOCKED_MESSAGE =
  'Too many failed login attempts. Try again in a few minutes.';

@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  constructor(
    private readonly loginAttempts: LoginAttemptsRepository,
    private readonly config: ConfigService,
  ) {}

  async assertNotLocked(identity: LoginAttemptIdentity): Promise<void> {
    const failures = await this.loginAttempts.count(identity);
    if (failures >= this.maxAttempts) {
      throw new HttpException(LOCKED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(identity: LoginAttemptIdentity): Promise<void> {
    const failures = await this.loginAttempts.increment(
      identity,
      this.lockoutSeconds,
    );
    if (failures < this.maxAttempts) {
      return;
    }
    await this.loginAttempts.startLockout(identity, this.lockoutSeconds);
    this.logger.warn(
      `Login locked after ${failures} failed attempts: ${maskEmail(identity.email)} from ${identity.ip} (tenant ${identity.tenantId}), ${this.lockoutSeconds}s`,
    );
  }

  reset(identity: LoginAttemptIdentity): Promise<void> {
    return this.loginAttempts.clear(identity);
  }

  private get maxAttempts(): number {
    return this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
  }

  private get lockoutSeconds(): number {
    return this.config.get<number>('LOGIN_LOCKOUT_SECONDS', 900);
  }
}
