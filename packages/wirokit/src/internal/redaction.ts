const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
  'x-nonce',
  'x-signature',
]);

export function redactHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const redacted = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADERS.has(name.toLowerCase())
      ? '[REDACTED]'
      : value;
  }
  return Object.freeze(redacted);
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    const port = url.port.length > 0 ? `:${url.port}` : '';
    return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
  } catch {
    return '[REDACTED]';
  }
}

export function redactSensitiveText(
  value: string,
  sensitiveValues: readonly string[],
): string {
  let redacted = value;
  const uniqueValues = [...new Set(sensitiveValues)]
    .filter((sensitive) => sensitive.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const sensitive of uniqueValues) {
    redacted = redacted.split(sensitive).join('[REDACTED]');
  }
  return redacted;
}

export function errorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name || 'Error';
  }
  if (typeof error === 'object' && error !== null && 'constructor' in error) {
    const constructor = error.constructor as {
      readonly name?: unknown;
    };
    if (typeof constructor.name === 'string' && constructor.name.length > 0) {
      return constructor.name;
    }
  }
  return 'Error';
}
