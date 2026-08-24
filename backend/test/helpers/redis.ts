import Redis from 'ioredis';

let client: Redis | undefined;

function getClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL is not set for tests (.env.test)');
    }
    client = new Redis(url, { maxRetriesPerRequest: 1 });
  }
  return client;
}

/**
 * Clears the login-attempt counters. Postgres is wiped by `resetDatabase()`, but
 * the lockout state lives in Redis — without this a failed-login test would leak
 * its counter into the next spec and lock an unrelated login.
 */
export async function resetLoginAttempts(): Promise<void> {
  const keys = await getClient().keys('login-attempts:*');
  if (keys.length > 0) {
    await getClient().del(...keys);
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}
