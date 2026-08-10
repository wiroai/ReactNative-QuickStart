import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FetchWiroHttpTransport,
  WiroHttpRequest,
  WiroNetworkError,
  WiroValidationError,
} from '../src';

function request(
  overrides: Partial<ConstructorParameters<typeof WiroHttpRequest>[0]> = {},
): WiroHttpRequest {
  return new WiroHttpRequest({
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
    maxResponseBodyBytes: 1_024,
    method: 'POST',
    timeoutMs: 30_000,
    url: 'https://api.wiro.ai/v1/Tool/List',
    ...overrides,
  });
}

describe('FetchWiroHttpTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs a fetch request and copies the response', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValue(
      new Response('{"ok":true}', {
        headers: { 'X-Request-Id': 'request-1' },
        status: 200,
      }),
    );
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });

    const response = await transport.perform(request());

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.wiro.ai/v1/Tool/List',
      expect.objectContaining({
        body: '{}',
        method: 'POST',
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"ok":true}');
    expect(response.header('x-request-id')).toBe('request-1');
    expect(Object.isFrozen(response.headers)).toBe(true);
  });

  it('supports requests without a body', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValue(new Response(null, { status: 204 }));
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });

    await transport.perform(
      new WiroHttpRequest({
        headers: {},
        maxResponseBodyBytes: 1_024,
        method: 'POST',
        timeoutMs: 30_000,
        url: 'https://api.wiro.ai/v1/Tool/List',
      }),
    );

    expect(fetchImplementation.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('maps fetch failures without exposing their message', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockRejectedValue(
      new TypeError('request failed with secret URL'),
    );
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });

    const error = await transport
      .perform(request())
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WiroNetworkError);
    if (!(error instanceof WiroNetworkError)) {
      throw new Error('Expected WiroNetworkError.');
    }
    expect(error.message).toBe('The network request failed.');
    expect(String(error)).not.toContain('secret URL');
  });

  it('preserves AbortError from fetch', async () => {
    const abortError = new DOMException('cancelled', 'AbortError');
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockRejectedValue(abortError);
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });

    await expect(transport.perform(request())).rejects.toBe(abortError);
  });

  it('preserves a pre-aborted request reason', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('cancelled', 'AbortError');
    controller.abort(abortError);
    const transport = new FetchWiroHttpTransport({
      fetchImplementation: vi.fn<typeof fetch>(),
    });

    await expect(
      transport.perform(request({ signal: controller.signal })),
    ).rejects.toBe(abortError);
  });

  it('aborts in-flight work when disposed', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });
    const pending = transport.perform(request());

    transport.dispose();

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(() => transport.dispose()).not.toThrow();
    await expect(transport.perform(request())).rejects.toThrow(
      'HTTP transport is disposed.',
    );
  });

  it('enforces declared and measured response limits', async () => {
    const declaredFetch = vi.fn<typeof fetch>();
    declaredFetch.mockResolvedValue(
      new Response('small', {
        headers: { 'Content-Length': '2000' },
        status: 200,
      }),
    );
    const measuredFetch = vi.fn<typeof fetch>();
    measuredFetch.mockResolvedValue(new Response('€€', { status: 200 }));

    await expect(
      new FetchWiroHttpTransport({
        fetchImplementation: declaredFetch,
      }).perform(request()),
    ).rejects.toThrow(
      'Response body exceeds the configured REST payload limit.',
    );
    await expect(
      new FetchWiroHttpTransport({
        fetchImplementation: measuredFetch,
      }).perform(request({ maxResponseBodyBytes: 5 })),
    ).rejects.toThrow(WiroValidationError);
  });

  it('requires an available fetch implementation', () => {
    vi.stubGlobal('fetch', undefined);

    expect(() => new FetchWiroHttpTransport()).toThrow(
      'A fetch implementation is required.',
    );
  });
});
