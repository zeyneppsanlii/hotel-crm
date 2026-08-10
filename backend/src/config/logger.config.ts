import { Params } from 'nestjs-pino';
import { Request } from 'express';

/**
 * Pino logger options. Structured JSON everywhere (each line carries level, time
 * and the request's `requestId`), pretty-printed only in development, and with
 * secrets / PII redacted so they never reach the logs.
 */
export function buildLoggerOptions(nodeEnv: string): Params {
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  return {
    pinoHttp: {
      level: isProduction ? 'info' : 'debug',
      // Dev: readable, colorized lines. Prod/test: plain JSON to stdout (also
      // avoids a pino-pretty worker thread in tests).
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss',
              // Hide the noisy fields in the terminal — they stay in the JSON record.
              ignore: 'pid,hostname,context,req,res,responseTime',
              messageFormat: '{if context}[{context}] {end}{msg}',
            },
          }
        : undefined,
      // Concise one-line summary per request; the full req/res stay as JSON fields.
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.url} → ${res.statusCode} (${responseTime}ms)`,
      customErrorMessage: (req, res) =>
        `${req.method} ${req.url} → ${res.statusCode}`,
      // Stamp our request id (set by RequestIdMiddleware) onto every log line.
      customProps: (req) => ({ requestId: (req as Request).requestId }),
      // Never log secrets or PII (pino-http serializes request headers).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.accessToken',
          '*.email',
          '*.phone',
        ],
        censor: '***',
      },
    },
  };
}
