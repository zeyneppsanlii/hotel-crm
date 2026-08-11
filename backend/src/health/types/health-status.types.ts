export type DependencyStatus = 'up' | 'down';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  uptime: number; // seconds since process start
  version: string;
  timestamp: string;
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
  };
}
