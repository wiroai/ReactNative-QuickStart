import { requireNonNegativeDuration } from './validation';

export interface WiroClock {
  epochMilliseconds(): number;
}

export interface WiroMonotonicClock {
  milliseconds(): number;
}

export interface WiroNonceProvider {
  nextNonce(): string;
}

export interface WiroDelay {
  sleep(durationMs: number, signal?: AbortSignal): Promise<void>;
}

export interface WiroJitterProvider {
  nextFactor(): number;
}

export interface WiroRuntimeDependencies {
  readonly clock: WiroClock;
  readonly delay: WiroDelay;
  readonly jitterProvider: WiroJitterProvider;
  readonly monotonicClock: WiroMonotonicClock;
  readonly nonceProvider: WiroNonceProvider;
}

export type WiroRuntimeOverrides = Partial<
  Omit<WiroRuntimeDependencies, 'nonceProvider'>
> & {
  readonly nonceProvider?: WiroNonceProvider;
};

const wallClock: WiroClock = Object.freeze({
  epochMilliseconds(): number {
    return Date.now();
  },
});

const monotonicClock: WiroMonotonicClock = Object.freeze({
  milliseconds(): number {
    return typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now()
      : Date.now();
  },
});

const delay: WiroDelay = Object.freeze({
  sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
    requireNonNegativeDuration(durationMs, 'duration');
    if (signal?.aborted === true) {
      return Promise.reject(signal.reason ?? createAbortError());
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(finish, durationMs);

      function finish(): void {
        signal?.removeEventListener('abort', abort);
        resolve();
      }

      function abort(): void {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(signal?.reason ?? createAbortError());
      }

      signal?.addEventListener('abort', abort, { once: true });
    });
  },
});

const jitterProvider: WiroJitterProvider = Object.freeze({
  nextFactor(): number {
    return 0.8 + Math.random() * 0.4;
  },
});

export function createRuntimeDependencies(
  overrides: WiroRuntimeOverrides = {},
): WiroRuntimeDependencies {
  const clock = overrides.clock ?? wallClock;
  const nonceProvider =
    overrides.nonceProvider ??
    Object.freeze({
      nextNonce(): string {
        return Math.trunc(clock.epochMilliseconds()).toString();
      },
    });

  return Object.freeze({
    clock,
    delay: overrides.delay ?? delay,
    jitterProvider: overrides.jitterProvider ?? jitterProvider,
    monotonicClock: overrides.monotonicClock ?? monotonicClock,
    nonceProvider,
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export function rethrowAbortError(error: unknown): void {
  if (isAbortError(error)) {
    throw error;
  }
}

export function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}
