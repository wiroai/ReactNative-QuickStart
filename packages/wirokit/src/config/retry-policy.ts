import { WiroValidationError } from '../errors/wiro-error';
import { requireNonNegativeDuration } from '../internal/validation';

export interface WiroRetryPolicyOptions {
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly maximumJitterFactor?: number;
  readonly maxRetries: number;
  readonly minimumJitterFactor?: number;
  readonly multiplier: number;
  readonly retryableStatusCodes: ReadonlySet<number>;
}

export class WiroRetryPolicy {
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
  readonly maximumJitterFactor: number;
  readonly maxRetries: number;
  readonly minimumJitterFactor: number;
  readonly multiplier: number;
  readonly #retryableStatusCodes: ReadonlySet<number>;

  constructor(options: WiroRetryPolicyOptions) {
    if (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0) {
      throw new WiroValidationError('maxRetries must not be negative.');
    }
    this.initialDelayMs = requireNonNegativeDuration(
      options.initialDelayMs,
      'initialDelay',
    );
    this.maximumDelayMs = requireNonNegativeDuration(
      options.maximumDelayMs,
      'maximumDelay',
    );
    if (!Number.isFinite(options.multiplier) || options.multiplier <= 0) {
      throw new WiroValidationError(
        'multiplier must be finite and greater than zero.',
      );
    }

    const minimumJitterFactor = options.minimumJitterFactor ?? 0.8;
    const maximumJitterFactor = options.maximumJitterFactor ?? 1.2;
    if (
      !Number.isFinite(minimumJitterFactor) ||
      !Number.isFinite(maximumJitterFactor) ||
      minimumJitterFactor < 0 ||
      minimumJitterFactor > maximumJitterFactor
    ) {
      throw new WiroValidationError('Invalid jitter factor range.');
    }

    this.maxRetries = options.maxRetries;
    this.multiplier = options.multiplier;
    this.minimumJitterFactor = minimumJitterFactor;
    this.maximumJitterFactor = maximumJitterFactor;
    this.#retryableStatusCodes = new Set(options.retryableStatusCodes);
    Object.freeze(this);
  }

  get retryableStatusCodes(): ReadonlySet<number> {
    return new Set(this.#retryableStatusCodes);
  }

  delayForRetry(retryIndex: number, jitterFactor: number): number {
    if (!Number.isSafeInteger(retryIndex)) {
      throw new WiroValidationError('retryIndex must be an integer.');
    }
    if (!Number.isFinite(jitterFactor)) {
      throw new WiroValidationError('jitterFactor must be finite.');
    }
    const exponent = Math.max(retryIndex, 0);
    const base = this.initialDelayMs * Math.pow(this.multiplier, exponent);
    const capped = Math.min(base, this.maximumDelayMs);
    const jitter = Math.min(
      Math.max(jitterFactor, this.minimumJitterFactor),
      this.maximumJitterFactor,
    );
    const milliseconds = Math.max(capped * jitter, 0);
    return Math.round(milliseconds * 1_000_000) / 1_000_000;
  }

  shouldRetry(statusCode: number): boolean {
    return this.#retryableStatusCodes.has(statusCode);
  }

  equals(other: unknown): other is WiroRetryPolicy {
    if (!(other instanceof WiroRetryPolicy)) {
      return false;
    }
    return (
      this.maxRetries === other.maxRetries &&
      this.initialDelayMs === other.initialDelayMs &&
      this.maximumDelayMs === other.maximumDelayMs &&
      this.multiplier === other.multiplier &&
      this.minimumJitterFactor === other.minimumJitterFactor &&
      this.maximumJitterFactor === other.maximumJitterFactor &&
      setsEqual(this.#retryableStatusCodes, other.#retryableStatusCodes)
    );
  }

  static get default(): WiroRetryPolicy {
    return new WiroRetryPolicy({
      initialDelayMs: 500,
      maximumDelayMs: 4_000,
      maxRetries: 2,
      multiplier: 2,
      retryableStatusCodes: new Set([408, 429, 500, 502, 503, 504]),
    });
  }

  static get none(): WiroRetryPolicy {
    return new WiroRetryPolicy({
      initialDelayMs: 0,
      maximumDelayMs: 0,
      maximumJitterFactor: 1,
      maxRetries: 0,
      minimumJitterFactor: 1,
      multiplier: 1,
      retryableStatusCodes: new Set(),
    });
  }
}

function setsEqual(
  left: ReadonlySet<number>,
  right: ReadonlySet<number>,
): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}
