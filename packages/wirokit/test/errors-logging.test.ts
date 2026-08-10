import { describe, expect, it } from 'vitest';

import {
  compareWiroLogLevels,
  noopWiroLogger,
  WiroApiResultError,
  WiroAuthenticationError,
  WiroError,
  WiroErrorCode,
  WiroLogEvent,
  WiroLogLevel,
  WiroNetworkError,
  WiroRateLimitError,
  WiroSchemaValidationError,
  WiroTimeoutError,
  WiroUnknownApiError,
  WiroValidationError,
  WiroWebSocketError,
} from '../src';
import { errorType, redactHeaders, redactUrl } from '../src/internal/redaction';

describe('Wiro error hierarchy', () => {
  it('keeps API diagnostics inspectable but out of rendering', () => {
    const secretBody = '{"apiKey":"secret-key","signature":"secret-signature"}';
    const error = new WiroApiResultError('Request failed.', {
      apiCode: 'provider_failed',
      rawResponseBody: secretBody,
      statusCode: 200,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WiroError);
    expect(error).toBeInstanceOf(WiroApiResultError);
    expect(error.code).toBe(WiroErrorCode.apiResult);
    expect(error.apiCode).toBe('provider_failed');
    expect(error.rawResponseBody).toBe(secretBody);
    expect(error.statusCode).toBe(200);
    expect(String(error)).not.toContain(secretBody);
    expect(error.stack).not.toContain(secretBody);
    expect(JSON.stringify(error)).not.toContain(secretBody);
  });

  it('provides stable category codes and subclasses', () => {
    const cases = [
      [
        new WiroAuthenticationError('Unauthorized.', {
          statusCode: 401,
        }),
        WiroErrorCode.authentication,
      ],
      [new WiroValidationError('Invalid.'), WiroErrorCode.validation],
      [new WiroRateLimitError('Slow down.'), WiroErrorCode.rateLimit],
      [
        new WiroUnknownApiError('Unknown.', {
          statusCode: 500,
        }),
        WiroErrorCode.unknownApi,
      ],
      [
        new WiroNetworkError('Connection failed.', 'TypeError'),
        WiroErrorCode.network,
      ],
      [
        new WiroWebSocketError('Socket failed.', 'Event'),
        WiroErrorCode.webSocket,
      ],
      [new WiroTimeoutError('Timed out.', 30_000), WiroErrorCode.timeout],
    ] as const;

    for (const [error, code] of cases) {
      expect(error).toBeInstanceOf(WiroError);
      expect(error.code).toBe(code);
    }
    expect(cases[1][0].statusCode).toBe(0);
    expect(cases[2][0].statusCode).toBe(429);
  });

  it('defensively copies schema messages', () => {
    const messages = ['width is invalid'];
    const error = new WiroSchemaValidationError(messages);

    messages.push('secret field');

    expect(error.messages).toEqual(['width is invalid']);
    expect(Object.isFrozen(error.messages)).toBe(true);
    expect(error.message).toBe('width is invalid');
    expect(new WiroSchemaValidationError([]).message).toBe(
      'Schema validation failed.',
    );
  });

  it('keeps retry and timeout metadata typed', () => {
    const rateLimit = new WiroRateLimitError('Slow down.', {
      retryAfterMs: 2_000,
    });
    const timeout = new WiroTimeoutError('Timed out.', 5_000);

    expect(rateLimit.retryAfterMs).toBe(2_000);
    expect(rateLimit.statusCode).toBe(429);
    expect(timeout.timeoutMs).toBe(5_000);
  });
});

describe('logging and redaction', () => {
  it('redacts sensitive headers case-insensitively', () => {
    const headers = redactHeaders({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
      Cookie: 'session=secret',
      'X-API-Key': 'api-secret',
      'x-nonce': '1700000000000',
      'X-Signature': 'signature-secret',
    });

    expect(headers).toEqual({
      Authorization: '[REDACTED]',
      'Content-Type': 'application/json',
      Cookie: '[REDACTED]',
      'X-API-Key': '[REDACTED]',
      'x-nonce': '[REDACTED]',
      'X-Signature': '[REDACTED]',
    });
    expect(Object.isFrozen(headers)).toBe(true);
  });

  it('removes URL credentials, query, and fragment', () => {
    const value =
      'https://user:password@example.com:8443/path/to/task' +
      '?token=secret#private';

    expect(redactUrl(value)).toBe('https://example.com:8443/path/to/task');
    expect(redactUrl('not a URL')).toBe('[REDACTED]');
  });

  it('records only error types and sanitized URLs', () => {
    const secret = 'secret-error-message';
    const event = new WiroLogEvent({
      durationMs: 250,
      error: new Error(secret),
      level: WiroLogLevel.warning,
      message: 'Retrying request.',
      method: 'POST',
      retryCount: 1,
      statusCode: 503,
      url: 'https://api.wiro.ai/v1/Task/Detail?token=secret',
    });

    expect(event.error).toBe('Error');
    expect(event.url).toBe('https://api.wiro.ai/v1/Task/Detail');
    expect(JSON.stringify(event)).not.toContain(secret);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('orders log levels and exposes a safe no-op logger', () => {
    expect(
      compareWiroLogLevels(WiroLogLevel.debug, WiroLogLevel.info),
    ).toBeLessThan(0);
    expect(
      compareWiroLogLevels(WiroLogLevel.error, WiroLogLevel.warning),
    ).toBeGreaterThan(0);

    const event = new WiroLogEvent({
      level: WiroLogLevel.info,
      message: 'Safe event.',
    });
    expect(() => noopWiroLogger.log(event)).not.toThrow();
  });

  it('returns stable safe error type names', () => {
    expect(errorType(new TypeError('secret'))).toBe('TypeError');
    expect(errorType('secret')).toBe('Error');
  });
});
