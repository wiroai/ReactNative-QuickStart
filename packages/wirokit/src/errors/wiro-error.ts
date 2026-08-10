export const WiroErrorCode = Object.freeze({
  apiResult: 'api_result',
  authentication: 'authentication',
  validation: 'validation',
  schemaValidation: 'schema_validation',
  rateLimit: 'rate_limit',
  unknownApi: 'unknown_api',
  network: 'network',
  webSocket: 'web_socket',
  timeout: 'timeout',
} as const);

export type WiroErrorCode = (typeof WiroErrorCode)[keyof typeof WiroErrorCode];

export interface WiroErrorOptions {
  readonly statusCode?: number;
  readonly rawResponseBody?: string;
}

export abstract class WiroError extends Error {
  readonly code: WiroErrorCode;
  readonly statusCode: number | undefined;
  readonly #rawResponseBody: string | undefined;

  protected constructor(
    name: string,
    code: WiroErrorCode,
    message: string,
    options: WiroErrorOptions = {},
  ) {
    super(message);
    this.name = name;
    this.code = code;
    this.statusCode = options.statusCode;
    this.#rawResponseBody = options.rawResponseBody;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get rawResponseBody(): string | undefined {
    return this.#rawResponseBody;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      code: this.code,
      message: this.message,
      name: this.name,
      ...(this.statusCode === undefined ? {} : { statusCode: this.statusCode }),
    });
  }
}

export interface WiroApiResultErrorOptions extends WiroErrorOptions {
  readonly apiCode?: string;
}

export class WiroApiResultError extends WiroError {
  readonly apiCode: string | undefined;

  constructor(message: string, options: WiroApiResultErrorOptions = {}) {
    super('WiroApiResultError', WiroErrorCode.apiResult, message, options);
    this.apiCode = options.apiCode;
  }
}

export class WiroAuthenticationError extends WiroError {
  constructor(message: string, options: WiroErrorOptions = {}) {
    super(
      'WiroAuthenticationError',
      WiroErrorCode.authentication,
      message,
      options,
    );
  }
}

export class WiroValidationError extends WiroError {
  constructor(message: string, options: WiroErrorOptions = {}) {
    super('WiroValidationError', WiroErrorCode.validation, message, {
      ...options,
      statusCode: options.statusCode ?? 0,
    });
  }
}

export class WiroSchemaValidationError extends WiroError {
  readonly messages: readonly string[];

  constructor(messages: readonly string[]) {
    const copiedMessages = Object.freeze([...messages]);
    super(
      'WiroSchemaValidationError',
      WiroErrorCode.schemaValidation,
      copiedMessages.length === 0
        ? 'Schema validation failed.'
        : copiedMessages.join('; '),
    );
    this.messages = copiedMessages;
  }
}

export interface WiroRateLimitErrorOptions extends WiroErrorOptions {
  readonly retryAfterMs?: number;
}

export class WiroRateLimitError extends WiroError {
  readonly retryAfterMs: number | undefined;

  constructor(
    message: string,
    options: WiroRateLimitErrorOptions = { statusCode: 429 },
  ) {
    super('WiroRateLimitError', WiroErrorCode.rateLimit, message, {
      ...options,
      statusCode: options.statusCode ?? 429,
    });
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class WiroUnknownApiError extends WiroError {
  constructor(message: string, options: WiroErrorOptions = {}) {
    super('WiroUnknownApiError', WiroErrorCode.unknownApi, message, options);
  }
}

export class WiroNetworkError extends WiroError {
  readonly underlyingType: string | undefined;

  constructor(message: string, underlyingType?: string) {
    super('WiroNetworkError', WiroErrorCode.network, message);
    this.underlyingType = underlyingType;
  }
}

export class WiroWebSocketError extends WiroError {
  readonly underlyingType: string | undefined;

  constructor(message: string, underlyingType?: string) {
    super('WiroWebSocketError', WiroErrorCode.webSocket, message);
    this.underlyingType = underlyingType;
  }
}

export class WiroTimeoutError extends WiroError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super('WiroTimeoutError', WiroErrorCode.timeout, message);
    this.timeoutMs = timeoutMs;
  }
}
