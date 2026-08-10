import {
  type WiroJson,
  WiroObjectValue,
  parseWiroValue,
} from '../core/wiro-value';
import {
  WiroApiResultError,
  WiroAuthenticationError,
  type WiroError,
  WiroRateLimitError,
  WiroUnknownApiError,
  WiroValidationError,
} from '../errors/wiro-error';
import {
  readList,
  readObjectBoolean,
  readObjectString,
} from '../internal/json-reader';
import type { WiroHttpResponse } from './http-transport';

const DEFAULT_API_ERROR_MESSAGE = 'Wiro API request failed.';
const INVALID_JSON_MESSAGE = 'Wiro API returned invalid JSON.';
const NON_OBJECT_MESSAGE = 'Wiro API returned a non-object JSON body.';

export type WiroMessageSanitizer = (message: string) => string;

export function decodeResponseEnvelope(
  response: WiroHttpResponse,
  sanitizeMessage: WiroMessageSanitizer = identity,
): WiroJson {
  const { body, statusCode } = response;
  const retryAfterMs = parseRetryAfter(response);
  const isSuccess = statusCode >= 200 && statusCode <= 299;

  if (body.length === 0) {
    if (isSuccess) {
      return Object.freeze({});
    }
    throw mapHttpError(
      statusCode,
      DEFAULT_API_ERROR_MESSAGE,
      retryAfterMs,
      undefined,
    );
  }

  let decoded;
  try {
    decoded = parseWiroValue(body);
  } catch {
    if (isSuccess) {
      throw new WiroUnknownApiError(INVALID_JSON_MESSAGE, {
        rawResponseBody: body,
        statusCode,
      });
    }
    throw mapHttpError(
      statusCode,
      DEFAULT_API_ERROR_MESSAGE,
      retryAfterMs,
      body,
    );
  }

  if (!(decoded instanceof WiroObjectValue)) {
    throw new WiroUnknownApiError(NON_OBJECT_MESSAGE, {
      rawResponseBody: body,
      statusCode,
    });
  }

  const object = decoded.value;
  const extractedMessage = extractMessage(object) ?? DEFAULT_API_ERROR_MESSAGE;
  const message = sanitizeMessage(extractedMessage);

  if (isSuccess) {
    if (readObjectBoolean(object, 'result') === false) {
      const apiCode = extractCode(object);
      throw new WiroApiResultError(message, {
        ...(apiCode === undefined ? {} : { apiCode }),
        rawResponseBody: body,
        statusCode,
      });
    }
    return object;
  }

  throw mapHttpError(statusCode, message, retryAfterMs, body);
}

export function mapHttpError(
  statusCode: number,
  message: string,
  retryAfterMs: number | undefined,
  rawResponseBody: string | undefined,
): WiroError {
  const options = {
    ...(rawResponseBody === undefined ? {} : { rawResponseBody }),
    statusCode,
  };
  switch (statusCode) {
    case 401:
    case 403:
      return new WiroAuthenticationError(message, options);
    case 400:
    case 422:
      return new WiroValidationError(message, options);
    case 429:
      return new WiroRateLimitError(message, {
        ...options,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    default:
      return new WiroUnknownApiError(message, options);
  }
}

export function extractMessage(object: WiroJson): string | undefined {
  const firstError = readList(object.errors)?.[0];
  if (firstError instanceof WiroObjectValue) {
    const message = readObjectString(firstError.value, 'message');
    if (message !== undefined && message.length > 0) {
      return message;
    }
  }
  const message = readObjectString(object, 'message');
  return message !== undefined && message.length > 0 ? message : undefined;
}

export function extractCode(object: WiroJson): string | undefined {
  const firstError = readList(object.errors)?.[0];
  return firstError instanceof WiroObjectValue
    ? readObjectString(firstError.value, 'code')
    : undefined;
}

export function parseRetryAfter(
  response: WiroHttpResponse,
): number | undefined {
  const raw = response.header('Retry-After')?.trim();
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds * 1_000;
}

function identity(value: string): string {
  return value;
}
