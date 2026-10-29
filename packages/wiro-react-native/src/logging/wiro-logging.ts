import { errorType, redactUrl } from '../internal/redaction';
import { requireNonNegativeDuration } from '../internal/validation';

export const WiroLogLevel = Object.freeze({
  debug: 'debug',
  info: 'info',
  warning: 'warning',
  error: 'error',
} as const);

export type WiroLogLevel = (typeof WiroLogLevel)[keyof typeof WiroLogLevel];

export interface WiroLogEventOptions {
  readonly durationMs?: number;
  readonly error?: unknown;
  readonly level: WiroLogLevel;
  readonly message: string;
  readonly method?: string;
  readonly retryCount?: number;
  readonly statusCode?: number;
  readonly url?: string;
}

export class WiroLogEvent {
  readonly durationMs: number | undefined;
  readonly error: string | undefined;
  readonly level: WiroLogLevel;
  readonly message: string;
  readonly method: string | undefined;
  readonly retryCount: number | undefined;
  readonly statusCode: number | undefined;
  readonly url: string | undefined;

  constructor(options: WiroLogEventOptions) {
    this.level = options.level;
    this.message = options.message;
    this.method = options.method;
    this.url = options.url === undefined ? undefined : redactUrl(options.url);
    this.statusCode = options.statusCode;
    this.durationMs =
      options.durationMs === undefined
        ? undefined
        : requireNonNegativeDuration(options.durationMs, 'duration');
    this.retryCount = options.retryCount;
    this.error =
      options.error === undefined ? undefined : errorType(options.error);
    Object.freeze(this);
  }
}

export interface WiroLogger {
  log(event: WiroLogEvent): void;
}

export const noopWiroLogger: WiroLogger = Object.freeze({
  log(): void {},
});

export function compareWiroLogLevels(
  left: WiroLogLevel,
  right: WiroLogLevel,
): number {
  return LOG_LEVEL_ORDER[left] - LOG_LEVEL_ORDER[right];
}

const LOG_LEVEL_ORDER: Readonly<Record<WiroLogLevel, number>> = Object.freeze({
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
});
