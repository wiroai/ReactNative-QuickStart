import { describe, expect, it, vi } from 'vitest';

import {
  WiroAuthType,
  WiroClient,
  WiroClientLimits,
  WiroFileInput,
  type WiroLogEvent,
  WiroRetryPolicy,
  WiroUnknownApiError,
  WiroValidationError,
  WiroValue,
} from '../src';
import {
  createWiroClientForTests,
  isRetryablePath,
  makeWiroUserAgent,
} from '../src/client/wiro-client';
import { createWiroSignature } from '../src/internal/signature';
import { FakeHttpTransport } from './support/fake-http-transport';

function testClient(
  transport: FakeHttpTransport,
  options: {
    readonly apiSecret?: string;
    readonly closeTransportOnClose?: boolean;
    readonly delays?: number[];
    readonly logger?: { log(event: WiroLogEvent): void };
    readonly nonceProvider?: { nextNonce(): string };
    readonly retryPolicy?: WiroRetryPolicy;
  } = {},
): WiroClient {
  return createWiroClientForTests(
    {
      apiKey: 'test-api-key',
      ...(options.apiSecret === undefined
        ? {}
        : { apiSecret: options.apiSecret }),
      ...(options.closeTransportOnClose === undefined
        ? {}
        : {
            closeTransportOnClose: options.closeTransportOnClose,
          }),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      retryPolicy: options.retryPolicy ?? WiroRetryPolicy.default,
      transport,
    },
    {
      clock: {
        epochMilliseconds: () => 1_700_000_000_000,
      },
      delay: {
        async sleep(durationMs, signal): Promise<void> {
          options.delays?.push(durationMs);
          if (signal?.aborted === true) {
            throw signal.reason;
          }
        },
      },
      jitterProvider: { nextFactor: () => 1 },
      nonceProvider: options.nonceProvider ?? {
        nextNonce: () => '1700000000000',
      },
    },
  );
}

describe('WiroClient authentication and configuration', () => {
  it('builds API-key requests with fixed SDK headers', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"ok":true}');
    const client = testClient(transport);

    await client.postJson('Tool/List', {
      search: WiroValue.string('image'),
    });

    const request = transport.requests[0];
    expect(request?.url).toBe('https://api.wiro.ai/v1/Tool/List');
    expect(request?.body).toBe('{"search":"image"}');
    expect(request?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'User-Agent': 'WiroKit-ReactNative/0.1.0',
      'x-api-key': 'test-api-key',
    });
    expect(request?.headers['x-nonce']).toBeUndefined();
    expect(request?.headers['x-signature']).toBeUndefined();
    expect(request?.timeoutMs).toBe(30_000);
    expect(client.authType).toBe(WiroAuthType.apiKey);
    expect(makeWiroUserAgent()).toBe('WiroKit-ReactNative/0.1.0');
  });

  it('builds signature headers from the shared contract vector', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{}');
    const client = testClient(transport, {
      apiSecret: 'test-secret',
    });

    await client.postJson('/Tool/List');

    expect(transport.requests[0]?.headers).toMatchObject({
      'x-api-key': 'test-api-key',
      'x-nonce': '1700000000000',
      'x-signature':
        '2d99fa1b6934f66a712785d1b402997e1b13d9d7cd5e0085211dac133ae4a8ef',
    });
    expect(client.authType).toBe(WiroAuthType.signature);
  });

  it('regenerates nonce and signature for every attempt', async () => {
    const nonces = ['nonce-1', 'nonce-2'];
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    transport.enqueueJson(200, '{}');
    const client = testClient(transport, {
      apiSecret: 'test-secret',
      nonceProvider: {
        nextNonce: () => nonces.shift() ?? 'unexpected',
      },
    });

    await client.postJson('/Tool/List');

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]?.headers['x-nonce']).toBe('nonce-1');
    expect(transport.requests[1]?.headers['x-nonce']).toBe('nonce-2');
    expect(transport.requests[0]?.headers['x-signature']).toBe(
      createWiroSignature('test-api-key', 'test-secret', 'nonce-1'),
    );
    expect(transport.requests[1]?.headers['x-signature']).toBe(
      createWiroSignature('test-api-key', 'test-secret', 'nonce-2'),
    );
  });

  it('keeps proxy credentials while protecting SDK headers', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{}');
    const client = createWiroClientForTests(
      {
        headers: {
          Authorization: 'Bearer proxy-secret',
          'content-TYPE': 'text/plain',
          'user-agent': 'spoofed',
        },
        proxyUrl: 'https://proxy.example.com/v1/',
        transport,
      },
      {
        nonceProvider: { nextNonce: () => 'unused' },
      },
    );

    await client.postJson('/Tool/List');

    expect(client.authType).toBe(WiroAuthType.proxy);
    expect(client.baseUrl).toBe('https://proxy.example.com/v1');
    expect(transport.requests[0]?.headers).toMatchObject({
      Authorization: 'Bearer proxy-secret',
      'Content-Type': 'application/json',
      'User-Agent': 'WiroKit-ReactNative/0.1.0',
    });
    expect(transport.requests[0]?.headers['x-api-key']).toBeUndefined();
    expect(transport.requests[0]?.headers['user-agent']).toBeUndefined();
  });

  it('rejects invalid credentials, URLs, headers, and durations', () => {
    expect(() => new WiroClient({ apiKey: ' ' })).toThrow(
      'apiKey must be a non-empty string.',
    );
    expect(
      () =>
        new WiroClient({
          apiKey: 'key',
          apiSecret: ' ',
        }),
    ).toThrow('apiSecret must be a non-empty string when provided.');
    expect(
      () =>
        new WiroClient({
          apiKey: 'key',
          baseUrl: 'ftp://api.wiro.ai/v1',
        }),
    ).toThrow(WiroValidationError);
    expect(
      () =>
        new WiroClient({
          apiKey: 'key',
          socketUrl: 'https://socket.wiro.ai/v1',
        }),
    ).toThrow(WiroValidationError);
    expect(
      () =>
        new WiroClient({
          headers: { 'X-Test': 'bad\nvalue' },
          proxyUrl: 'https://proxy.example.com',
        }),
    ).toThrow('Invalid HTTP header value.');
    expect(
      () =>
        new WiroClient({
          apiKey: 'key',
          pollIntervalMs: 0,
        }),
    ).toThrow(WiroValidationError);
  });
});

describe('WiroClient retries and safety', () => {
  it('retries transient HTTP failures until success', async () => {
    const delays: number[] = [];
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    transport.enqueueJson(200, '{"ok":true}');
    const client = testClient(transport, { delays });

    await client.postJson('/Tool/List');

    expect(transport.requests).toHaveLength(2);
    expect(delays).toEqual([500]);
  });

  it('performs the initial attempt plus maximum retries', async () => {
    const transport = new FakeHttpTransport();
    for (let index = 0; index < 3; index += 1) {
      transport.enqueueJson(503, '{"message":"busy"}');
    }
    const client = testClient(transport);

    await expect(client.postJson('/Tool/List')).rejects.toBeInstanceOf(
      WiroUnknownApiError,
    );
    expect(transport.requests).toHaveLength(3);
  });

  it.each(['/Run/owner/project', '/File/Upload'])(
    'never retries billable path %s',
    async (path) => {
      const transport = new FakeHttpTransport();
      transport.enqueueJson(503, '{"message":"busy"}');
      const client = testClient(transport);

      await expect(client.postJson(path)).rejects.toBeInstanceOf(
        WiroUnknownApiError,
      );
      expect(transport.requests).toHaveLength(1);
    },
  );

  it('classifies retryable paths exactly', () => {
    expect(isRetryablePath('/Run/a/b')).toBe(false);
    expect(isRetryablePath('File/Upload')).toBe(false);
    expect(isRetryablePath('/Tool/List')).toBe(true);
  });

  it('does not retry non-transient HTTP failures', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(404, '{"message":"missing"}');
    const client = testClient(transport);

    await expect(client.postJson('/Tool/List')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(transport.requests).toHaveLength(1);
  });

  it('retries mapped and unexpected network failures', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueue(() => {
      throw new TypeError('secret URL');
    });
    transport.enqueueJson(200, '{}');
    const client = testClient(transport);

    await client.postJson('/Tool/List');

    expect(transport.requests).toHaveLength(2);
  });

  it('uses Retry-After as a minimum delay', async () => {
    const delays: number[] = [];
    const transport = new FakeHttpTransport();
    transport.enqueueJson(429, '{"message":"slow"}', {
      'Retry-After': '3',
    });
    transport.enqueueJson(200, '{}');
    const client = testClient(transport, { delays });

    await client.postJson('/Tool/List');

    expect(delays).toEqual([3_000]);
  });

  it('rejects oversized and unresolved request bodies', async () => {
    const transport = new FakeHttpTransport();
    const limitedClient = new WiroClient({
      apiKey: 'key',
      limits: new WiroClientLimits({
        maxRestBodyBytes: 5,
      }),
      transport,
    });

    await expect(
      limitedClient.postJson('/Tool/List', {
        value: WiroValue.string('large'),
      }),
    ).rejects.toThrow(
      'Request body exceeds the configured REST payload limit.',
    );

    const secretName = 'private-file.bin';
    await expect(
      limitedClient.postJson('/Tool/List', {
        file: WiroValue.fileInput(
          WiroFileInput.bytes(new Uint8Array([1]), secretName),
        ),
      }),
    ).rejects.toThrow('Cannot serialize an unresolved WiroFileInput');
    expect(transport.requests).toHaveLength(0);
  });

  it('enforces response limits for injected transports', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"value":"large"}');
    const client = new WiroClient({
      apiKey: 'key',
      limits: new WiroClientLimits({
        maxRestBodyBytes: 10,
      }),
      retryPolicy: WiroRetryPolicy.none,
      transport,
    });

    await expect(client.postJson('/Tool/List')).rejects.toThrow(
      'Response body exceeds the configured REST payload limit.',
    );
    expect(transport.requests).toHaveLength(1);
  });
});

describe('WiroClient cancellation and ownership', () => {
  it('preserves cancellation during requests', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueue(
      async (request) =>
        await new Promise((_resolve, reject) => {
          request.signal?.addEventListener(
            'abort',
            () => reject(request.signal?.reason),
            { once: true },
          );
        }),
    );
    const client = testClient(transport);
    const controller = new AbortController();
    const abortError = new DOMException('stop', 'AbortError');
    const pending = client.postJson(
      '/Tool/List',
      {},
      {
        signal: controller.signal,
      },
    );

    controller.abort(abortError);

    await expect(pending).rejects.toBe(abortError);
    expect(transport.requests).toHaveLength(1);
  });

  it('preserves cancellation during retry delays', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    const controller = new AbortController();
    const abortError = new DOMException('stop delay', 'AbortError');
    const client = createWiroClientForTests(
      {
        apiKey: 'key',
        transport,
      },
      {
        delay: {
          async sleep(_durationMs, signal): Promise<void> {
            controller.abort(abortError);
            if (signal?.aborted === true) {
              throw signal.reason;
            }
          },
        },
        jitterProvider: { nextFactor: () => 1 },
      },
    );

    await expect(
      client.postJson(
        '/Tool/List',
        {},
        {
          signal: controller.signal,
        },
      ),
    ).rejects.toBe(abortError);
    expect(transport.requests).toHaveLength(1);
  });

  it('aborts retry delays when the client closes', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    let markDelayStarted: (() => void) | undefined;
    const delayStarted = new Promise<void>((resolve) => {
      markDelayStarted = resolve;
    });
    const client = createWiroClientForTests(
      {
        apiKey: 'key',
        transport,
      },
      {
        delay: {
          async sleep(): Promise<void> {
            markDelayStarted?.();
            return await new Promise<void>(() => {});
          },
        },
        jitterProvider: { nextFactor: () => 1 },
      },
    );
    const pending = client.postJson('/Tool/List');
    const rejection = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });

    await delayStarted;
    client.close();

    await rejection;
  });

  it('closes owned transport and rejects future work', async () => {
    const transport = new FakeHttpTransport();
    const client = testClient(transport, {
      closeTransportOnClose: true,
    });

    client.close();
    client.close();

    expect(client.isClosed).toBe(true);
    expect(transport.disposeCount).toBe(1);
    await expect(client.postJson('/Tool/List')).rejects.toThrow(
      'WiroClient is closed.',
    );
  });

  it('leaves caller-owned transport open', () => {
    const transport = new FakeHttpTransport();
    const client = testClient(transport);

    client.close();

    expect(transport.disposeCount).toBe(0);
  });

  it('aborts in-flight requests when closed', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueue(
      async (request) =>
        await new Promise((_resolve, reject) => {
          request.signal?.addEventListener(
            'abort',
            () => reject(request.signal?.reason),
            { once: true },
          );
        }),
    );
    const client = testClient(transport);
    const pending = client.postJson('/Tool/List');

    client.close();

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('maps per-attempt timeouts to retryable network errors', async () => {
    vi.useFakeTimers();
    const transport = new FakeHttpTransport();
    transport.enqueue(
      async (request) =>
        await new Promise((_resolve, reject) => {
          request.signal?.addEventListener(
            'abort',
            () => reject(request.signal?.reason),
            { once: true },
          );
        }),
    );
    const client = createWiroClientForTests(
      {
        apiKey: 'key',
        requestTimeoutMs: 10,
        retryPolicy: WiroRetryPolicy.none,
        transport,
      },
      {},
    );
    const pending = client.postJson('/Tool/List');
    const rejection = expect(pending).rejects.toMatchObject({
      code: 'network',
      underlyingType: 'TimeoutError',
    });

    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    vi.useRealTimers();
  });
});

describe('WiroClient logging and redaction', () => {
  it('emits safe request lifecycle events', async () => {
    const events: WiroLogEvent[] = [];
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy test-api-key"}');
    transport.enqueueJson(200, '{}');
    const client = testClient(transport, {
      logger: { log: (event) => events.push(event) },
    });

    await client.postJson('/Tool/List');

    expect(events.map((event) => event.level)).toEqual([
      'debug',
      'info',
      'warning',
      'debug',
      'info',
    ]);
    expect(events[2]?.message).toBe(
      'Retrying request after transient failure.',
    );
    expect(JSON.stringify(events)).not.toContain('test-api-key');
    expect(JSON.stringify(events)).not.toContain('x-signature');
  });

  it('redacts credentials echoed in structured errors', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(401, '{"message":"key test-api-key is denied"}');
    const client = testClient(transport, {
      retryPolicy: WiroRetryPolicy.none,
    });

    const error = await client
      .postJson('/Tool/List')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new Error('Expected an Error.');
    }
    expect(error.message).toBe('key [REDACTED] is denied');
    expect(String(error)).not.toContain('test-api-key');
  });
});
