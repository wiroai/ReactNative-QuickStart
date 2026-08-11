import { describe, expect, it } from 'vitest';

import {
  WiroApiResultError,
  WiroAuthenticationError,
  WiroHttpResponse,
  WiroRateLimitError,
  WiroUnknownApiError,
  WiroValidationError,
  stringifyWiroJson,
} from '../src';
import {
  decodeResponseEnvelope,
  extractCode,
  extractMessage,
  MAX_RETRY_AFTER_MS,
  parseRetryAfter,
} from '../src/transport/response-envelope';
import { parseWiroJson } from '../src/core/wiro-value';

function response(
  statusCode: number,
  body: string,
  headers: Readonly<Record<string, string>> = {},
): WiroHttpResponse {
  return new WiroHttpResponse({
    body,
    headers,
    statusCode,
  });
}

describe('response envelope decoding', () => {
  it('maps result false to a typed API result error', () => {
    const body = '{"result":false,"errors":[{"message":"nope","code":"E1"}]}';

    const error = capture(() => decodeResponseEnvelope(response(200, body)));

    expect(error).toBeInstanceOf(WiroApiResultError);
    expect(error).toMatchObject({
      apiCode: 'E1',
      message: 'nope',
      statusCode: 200,
    });
    expect((error as WiroApiResultError).rawResponseBody).toBe(body);
    expect(String(error)).not.toContain(body);
  });

  it.each([
    [401, WiroAuthenticationError],
    [403, WiroAuthenticationError],
    [400, WiroValidationError],
    [422, WiroValidationError],
    [500, WiroUnknownApiError],
  ])('maps HTTP %s to %s', (statusCode, errorType) => {
    expect(() =>
      decodeResponseEnvelope(response(statusCode, '{"message":"failed"}')),
    ).toThrow(errorType);
  });

  it('maps rate limits and delta-seconds Retry-After', () => {
    const error = capture(() =>
      decodeResponseEnvelope(
        response(429, '{"message":"slow"}', {
          'retry-after': ' 7.5 ',
        }),
      ),
    );

    expect(error).toBeInstanceOf(WiroRateLimitError);
    expect(error).toMatchObject({
      message: 'slow',
      retryAfterMs: 7_500,
      statusCode: 429,
    });
  });

  it('returns empty or decoded success objects', () => {
    expect(decodeResponseEnvelope(response(204, ''))).toEqual({});
    expect(
      stringifyWiroJson(
        decodeResponseEnvelope(response(200, '{"tool":[],"future":1.00}')),
      ),
    ).toBe('{"tool":[],"future":1.00}');
    expect(
      decodeResponseEnvelope(response(200, '{"result":true}')).result,
    ).toBeDefined();
  });

  it('uses a stable fallback for empty HTTP errors', () => {
    const error = capture(() => decodeResponseEnvelope(response(500, '')));

    expect(error).toBeInstanceOf(WiroUnknownApiError);
    expect(error.message).toBe('Wiro API request failed.');
    expect((error as WiroUnknownApiError).rawResponseBody).toBeUndefined();
  });

  it('keeps invalid bodies diagnostic-only', () => {
    const secretBody = 'bad gateway with secret-token';
    const successError = capture(() =>
      decodeResponseEnvelope(response(200, secretBody)),
    );
    const httpError = capture(() =>
      decodeResponseEnvelope(response(502, secretBody)),
    );

    expect(successError.message).toBe('Wiro API returned invalid JSON.');
    expect(httpError.message).toBe('Wiro API request failed.');
    expect((successError as WiroUnknownApiError).rawResponseBody).toBe(
      secretBody,
    );
    expect(String(successError)).not.toContain(secretBody);
    expect(String(httpError)).not.toContain(secretBody);
  });

  it('rejects non-object JSON while preserving diagnostics', () => {
    const error = capture(() =>
      decodeResponseEnvelope(response(200, '[1,2,3]')),
    );

    expect(error.message).toBe('Wiro API returned a non-object JSON body.');
    expect((error as WiroUnknownApiError).rawResponseBody).toBe('[1,2,3]');
    expect(String(error)).not.toContain('[1,2,3]');
  });

  it('redacts known secrets from structured error messages', () => {
    const error = capture(() =>
      decodeResponseEnvelope(
        response(401, '{"message":"credential secret-key is invalid"}'),
        (message) => message.replace('secret-key', '[REDACTED]'),
      ),
    );

    expect(error.message).toBe('credential [REDACTED] is invalid');
  });

  it('extracts error-list values before top-level values', () => {
    const object = parseWiroJson(
      '{"message":"top","errors":[{"message":42,"code":7.0}]}',
    );

    expect(extractMessage(object)).toBe('42');
    expect(extractCode(object)).toBe('7.0');
    expect(extractMessage(parseWiroJson('{"message":true}'))).toBe('true');
    expect(extractMessage(parseWiroJson('{}'))).toBeUndefined();
    expect(extractCode(parseWiroJson('{}'))).toBeUndefined();
  });
});

describe('Retry-After parsing', () => {
  it.each([
    ['', undefined],
    ['-1', undefined],
    ['Infinity', undefined],
    ['NaN', undefined],
    ['Wed, 21 Oct 2015 07:28:00 GMT', undefined],
    ['0', 0],
    ['0.25', 250],
    ['2147483648', MAX_RETRY_AFTER_MS],
    ['1e308', undefined],
  ])('parses %j as %s', (raw, expected) => {
    expect(parseRetryAfter(response(429, '', { 'Retry-After': raw }))).toBe(
      expected,
    );
  });

  it('returns undefined when the header is absent', () => {
    expect(parseRetryAfter(response(429, ''))).toBeUndefined();
  });
});

function capture(operation: () => unknown): Error {
  try {
    operation();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }
  throw new Error('Expected operation to throw.');
}
