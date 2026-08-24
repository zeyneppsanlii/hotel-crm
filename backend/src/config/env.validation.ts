import { z } from 'zod';

/**
 * Environment schema. Validated once at startup (see ConfigModule in AppModule);
 * a missing or malformed variable aborts boot with a message naming the offender,
 * instead of failing deep in runtime days later.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Runtime DB connection (non-superuser app role, RLS-enforced).
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  // Migration DB connection (superuser). Only the Prisma CLI needs it, so it is
  // optional at app runtime.
  DIRECT_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string')
    .optional(),
  JWT_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('24h'),
  JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('30d'),
  REDIS_URL: z
    .string()
    .regex(/^redis:\/\//, 'must be a redis:// connection string'),
  // Brute-force lockout: how many failed logins are tolerated per
  // tenant+email+IP, and how long the lockout lasts once the threshold is hit.
  // Lowered in .env.test so the suite does not spend real seconds waiting.
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
});

export type Env = z.infer<typeof envSchema>;

/**
 * ConfigModule `validate` hook. Returns the parsed (coerced + defaulted) config on
 * success; throws a single readable error listing every invalid variable so boot
 * fails fast with an actionable message.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(
        (issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return parsed.data;
}
