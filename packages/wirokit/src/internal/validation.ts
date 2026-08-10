import { WiroValidationError } from '../errors/wiro-error';

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const INVALID_HEADER_VALUE_PATTERN = /[\r\n\u0000]/;
const INVALID_FILE_NAME_PATTERN = /[\r\n\u0000/\\]/;

export type WiroUrlKind = 'http' | 'webSocket';

interface UrlValidationOptions {
  readonly allowFragment?: boolean;
  readonly allowQuery?: boolean;
  readonly label: string;
}

export function validateUrl(
  value: string,
  kind: WiroUrlKind,
  options: UrlValidationOptions,
): string {
  if (value !== value.trim() || INVALID_HEADER_VALUE_PATTERN.test(value)) {
    throw new WiroValidationError(`${options.label} is not a valid URL.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WiroValidationError(`${options.label} is not a valid URL.`);
  }

  const schemes = kind === 'http' ? ['http:', 'https:'] : ['ws:', 'wss:'];
  if (!schemes.includes(parsed.protocol.toLowerCase())) {
    const names = schemes.map((scheme) => scheme.slice(0, -1));
    throw new WiroValidationError(
      `${options.label} must use ${names.join(' or ')} scheme.`,
    );
  }
  if (parsed.hostname.length === 0) {
    throw new WiroValidationError(`${options.label} must include a host.`);
  }
  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    rawAuthority(value).includes('@')
  ) {
    throw new WiroValidationError(
      `${options.label} must not contain userinfo.`,
    );
  }
  if (!options.allowQuery && value.includes('?')) {
    throw new WiroValidationError(
      `${options.label} must not contain a query string.`,
    );
  }
  if (!options.allowFragment && value.includes('#')) {
    throw new WiroValidationError(
      `${options.label} must not contain a fragment.`,
    );
  }

  return value;
}

export function validateBaseUrl(value: string): string {
  validateUrl(value, 'http', { label: 'base URL' });
  return trimTrailingSlashes(value);
}

export function validateWebSocketUrl(value: string): string {
  validateUrl(value, 'webSocket', { label: 'WebSocket URL' });
  return trimTrailingSlashes(value);
}

export function validateCallbackUrl(value: string): string {
  return validateUrl(value, 'http', {
    allowQuery: true,
    label: 'callback URL',
  });
}

export function validateRemoteFileUrl(value: string): string {
  return validateUrl(value, 'http', {
    allowQuery: true,
    label: 'file URL',
  });
}

export function trimTrailingSlashes(value: string): string {
  const trimmed = value.replace(/\/+$/u, '');
  return trimmed.length === 0 ? value : trimmed;
}

export function requirePositiveDuration(
  durationMs: number,
  label: string,
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new WiroValidationError(
      `${label} must be finite and greater than zero.`,
    );
  }
  return durationMs;
}

export function requireNonNegativeDuration(
  durationMs: number,
  label: string,
): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new WiroValidationError(
      `${label} must be finite and must not be negative.`,
    );
  }
  return durationMs;
}

export function validateHeader(name: string, value: string): void {
  if (!HEADER_NAME_PATTERN.test(name)) {
    throw new WiroValidationError('Invalid HTTP header name.');
  }
  if (INVALID_HEADER_VALUE_PATTERN.test(value)) {
    throw new WiroValidationError('Invalid HTTP header value.');
  }
}

export function validateFileName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new WiroValidationError('fileName must be non-empty.');
  }
  if (trimmed.length > 255) {
    throw new WiroValidationError('fileName must not exceed 255 characters.');
  }
  if (INVALID_FILE_NAME_PATTERN.test(trimmed)) {
    throw new WiroValidationError('fileName contains invalid characters.');
  }
  return trimmed;
}

export function validateOptionalMediaType(
  value: string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || INVALID_HEADER_VALUE_PATTERN.test(trimmed)) {
    throw new WiroValidationError('Invalid media type.');
  }
  return trimmed;
}

export function validateExpoUri(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || INVALID_HEADER_VALUE_PATTERN.test(trimmed)) {
    throw new WiroValidationError('Invalid Expo file URI.');
  }

  const schemeSeparator = trimmed.indexOf(':');
  if (schemeSeparator <= 0) {
    throw new WiroValidationError('Expo file URI must include a scheme.');
  }
  return trimmed;
}

export function validateOptionalSize(
  value: number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new WiroValidationError(
      'sizeBytes must be a non-negative safe integer.',
    );
  }
  return value;
}

function rawAuthority(value: string): string {
  const schemeSeparator = value.indexOf('://');
  if (schemeSeparator < 0) {
    return '';
  }
  const authorityStart = schemeSeparator + 3;
  const authorityEnd = value.slice(authorityStart).search(/[/?#]/u);
  return authorityEnd < 0
    ? value.slice(authorityStart)
    : value.slice(authorityStart, authorityStart + authorityEnd);
}
