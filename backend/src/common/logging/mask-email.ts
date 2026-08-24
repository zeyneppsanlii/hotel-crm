const MASK = '***';

/**
 * `ayse@otel.com` -> `a***@otel.com`. Pino's `redact` only reaches structured
 * fields, so an address interpolated into a log message has to be masked here.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) {
    return MASK;
  }
  return `${email[0]}${MASK}${email.slice(at)}`;
}
