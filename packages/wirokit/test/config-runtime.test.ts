import { describe, expect, it, vi } from 'vitest';

import {
  WiroAuthType,
  WiroClientDefaults,
  WiroClientLimits,
  WiroError,
  WiroRetryPolicy,
  WiroValidationError,
} from '../src';
import {
  createRuntimeDependencies,
  isAbortError,
  rethrowAbortError,
} from '../src/internal/runtime';

describe('WiroRetryPolicy', () => {
  it('matches the verified defaults', () => {
    const policy = WiroRetryPolicy.default;

    expect(policy.maxRetries).toBe(2);
    expect(policy.initialDelayMs).toBe(500);
    expect(policy.maximumDelayMs).toBe(4_000);
    expect(policy.multiplier).toBe(2);
    expect(policy.minimumJitterFactor).toBe(0.8);
    expect(policy.maximumJitterFactor).toBe(1.2);
    expect([...policy.retryableStatusCodes]).toEqual([
      408, 429, 500, 502, 503, 504,
    ]);
  });

  it('calculates deterministic capped and clamped delays', () => {
    const policy = WiroRetryPolicy.default;

    expect(policy.delayForRetry(0, 1)).toBe(500);
    expect(policy.delayForRetry(1, 1)).toBe(1_000);
    expect(policy.delayForRetry(2, 1)).toBe(2_000);
    expect(policy.delayForRetry(10, 1)).toBe(4_000);
    expect(policy.delayForRetry(0, 0.1)).toBe(400);
    expect(policy.delayForRetry(0, 2)).toBe(600);
    expect(policy.delayForRetry(-1, 1)).toBe(500);
  });

  it('does not expose its mutable status set', () => {
    const policy = WiroRetryPolicy.default;
    const exposed = policy.retryableStatusCodes as Set<number>;

    exposed.add(418);

    expect(policy.shouldRetry(418)).toBe(false);
    expect(policy.shouldRetry(429)).toBe(true);
  });

  it('provides an explicit no-retry policy', () => {
    const policy = WiroRetryPolicy.none;

    expect(policy.maxRetries).toBe(0);
    expect(policy.delayForRetry(5, 0.5)).toBe(0);
    expect(policy.retryableStatusCodes.size).toBe(0);
  });

  it.each([
    () =>
      new WiroRetryPolicy({
        initialDelayMs: 1,
        maximumDelayMs: 1,
        maxRetries: -1,
        multiplier: 1,
        retryableStatusCodes: new Set(),
      }),
    () =>
      new WiroRetryPolicy({
        initialDelayMs: -1,
        maximumDelayMs: 1,
        maxRetries: 1,
        multiplier: 1,
        retryableStatusCodes: new Set(),
      }),
    () =>
      new WiroRetryPolicy({
        initialDelayMs: 1,
        maximumDelayMs: 1,
        maxRetries: 1,
        multiplier: Number.NaN,
        retryableStatusCodes: new Set(),
      }),
    () =>
      new WiroRetryPolicy({
        initialDelayMs: 1,
        maximumDelayMs: 1,
        maximumJitterFactor: 0.8,
        maxRetries: 1,
        minimumJitterFactor: 1.2,
        multiplier: 1,
        retryableStatusCodes: new Set(),
      }),
  ])('rejects malformed policy %#', (createPolicy) => {
    expect(createPolicy).toThrow(WiroValidationError);
  });

  it('rejects malformed delay inputs', () => {
    expect(() => WiroRetryPolicy.default.delayForRetry(0.5, 1)).toThrow(
      WiroValidationError,
    );
    expect(() => WiroRetryPolicy.default.delayForRetry(0, Number.NaN)).toThrow(
      WiroValidationError,
    );
  });

  it('supports value equality across policies', () => {
    const policy = WiroRetryPolicy.default;

    expect(policy.equals(WiroRetryPolicy.default)).toBe(true);
    expect(policy.equals(WiroRetryPolicy.none)).toBe(false);
    expect(policy.equals({})).toBe(false);
  });
});

describe('configuration values', () => {
  it('exposes fixed auth and endpoint values', () => {
    expect(Object.values(WiroAuthType)).toEqual([
      'apiKey',
      'signature',
      'proxy',
    ]);
    expect(WiroClientDefaults).toEqual({
      pollIntervalMs: 3_000,
      requestTimeoutMs: 30_000,
      restBaseUrl: 'https://api.wiro.ai/v1',
      webSocketUrl: 'wss://socket.wiro.ai/v1',
    });
    expect(Object.isFrozen(WiroClientDefaults)).toBe(true);
  });

  it('uses verified client limits and value equality', () => {
    const limits = WiroClientLimits.default;

    expect(limits.maxRestBodyBytes).toBe(16 * 1024 * 1024);
    expect(limits.maxWebSocketTextBytes).toBe(8 * 1024 * 1024);
    expect(limits.maxWebSocketBinaryBytes).toBe(8 * 1024 * 1024);
    expect(limits.maxInMemoryUploadBytes).toBe(16 * 1024 * 1024);
    expect(limits.equals(new WiroClientLimits())).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity])(
    'rejects invalid client limit %s',
    (value) => {
      expect(
        () =>
          new WiroClientLimits({
            maxRestBodyBytes: value,
          }),
      ).toThrow(WiroValidationError);
    },
  );
});

describe('runtime seams and cancellation', () => {
  it('derives deterministic nonces from an injected clock', () => {
    const runtime = createRuntimeDependencies({
      clock: {
        epochMilliseconds: () => 1_700_000_000_000,
      },
      jitterProvider: {
        nextFactor: () => 1,
      },
      monotonicClock: {
        milliseconds: () => 25,
      },
    });

    expect(runtime.nonceProvider.nextNonce()).toBe('1700000000000');
    expect(runtime.nonceProvider.nextNonce()).toBe('1700000000001');
    expect(runtime.jitterProvider.nextFactor()).toBe(1);
    expect(runtime.monotonicClock.milliseconds()).toBe(25);
  });

  it('allows a fully injected delay implementation', async () => {
    const sleep = vi.fn(async () => {});
    const runtime = createRuntimeDependencies({
      delay: { sleep },
    });

    await runtime.delay.sleep(250);

    expect(sleep).toHaveBeenCalledWith(250);
  });

  it('preserves the native abort reason', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('cancelled by test', 'AbortError');
    controller.abort(abortError);
    const runtime = createRuntimeDependencies();

    await expect(runtime.delay.sleep(1_000, controller.signal)).rejects.toBe(
      abortError,
    );
    expect(isAbortError(abortError)).toBe(true);
    expect(abortError).not.toBeInstanceOf(WiroError);
    expect(() => rethrowAbortError(abortError)).toThrow(abortError);
  });

  it('runs production clock, jitter, and delay adapters', async () => {
    vi.useFakeTimers();
    const runtime = createRuntimeDependencies();
    const sleep = runtime.delay.sleep(10);

    expect(Number.isFinite(runtime.clock.epochMilliseconds())).toBe(true);
    expect(Number.isFinite(runtime.monotonicClock.milliseconds())).toBe(true);
    expect(runtime.jitterProvider.nextFactor()).toBeGreaterThanOrEqual(0.8);
    expect(runtime.jitterProvider.nextFactor()).toBeLessThan(1.2);

    await vi.advanceTimersByTimeAsync(10);
    await expect(sleep).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('aborts an active production delay without wrapping', async () => {
    const runtime = createRuntimeDependencies();
    const controller = new AbortController();
    const abortError = new DOMException('active abort', 'AbortError');
    const sleep = runtime.delay.sleep(1_000, controller.signal);

    controller.abort(abortError);

    await expect(sleep).rejects.toBe(abortError);
  });

  it('creates an AbortError when a signal has no reason', async () => {
    const runtime = createRuntimeDependencies();
    const signal = {
      aborted: true,
      reason: undefined,
    } as AbortSignal;

    await expect(runtime.delay.sleep(1, signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('supports AbortError detection without wrapping other errors', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError(new Error('network'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(() => rethrowAbortError(new Error('network'))).not.toThrow();
  });
});
