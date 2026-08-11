import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExpoWiroSocketSessionFactory,
  FetchWiroHttpTransport,
  MAX_WIRO_JSON_DEPTH,
  WiroClient,
  WiroClientLimits,
  WiroFileInput,
  WiroHttpRequest,
  WiroHttpResponse,
  WiroRetryPolicy,
  WiroRunResult,
  WiroSocketEvent,
  WiroSocketMessage,
  WiroTask,
  WiroTaskId,
  WiroTaskToken,
  WiroTaskUpdate,
  WiroValidationError,
  WiroValue,
  parseWiroJson,
  stringifyWiroJson,
} from '../src';
import { createWiroClientForTests } from '../src/client/wiro-client';
import { createRuntimeDependencies } from '../src/internal/runtime';
import { createWiroSignature } from '../src/internal/signature';
import { FakeHttpTransport } from './support/fake-http-transport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Step 10 concurrency hardening', () => {
  it('emits unique nonces for parallel signature requests', async () => {
    const transport = new FakeHttpTransport();
    const nonces: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      transport.enqueue(async (request) => {
        nonces.push(request.headers['x-nonce'] ?? '');
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new WiroHttpResponse({
          body: '{}',
          statusCode: 200,
        });
      });
    }
    const client = createWiroClientForTests(
      {
        apiKey: 'test-api-key',
        apiSecret: 'test-secret',
        retryPolicy: WiroRetryPolicy.none,
        transport,
      },
      {
        clock: {
          epochMilliseconds: () => 1_700_000_000_000,
        },
      },
    );

    await Promise.all(
      Array.from({ length: 8 }, () => client.postJson('/Tool/List')),
    );

    expect(new Set(nonces).size).toBe(8);
    expect(nonces.sort()).toEqual([
      '1700000000000',
      '1700000000001',
      '1700000000002',
      '1700000000003',
      '1700000000004',
      '1700000000005',
      '1700000000006',
      '1700000000007',
    ]);
    for (const nonce of nonces) {
      expect(createWiroSignature('test-api-key', 'test-secret', nonce)).toBe(
        transport.requests.find(
          (request) => request.headers['x-nonce'] === nonce,
        )?.headers['x-signature'],
      );
    }
    client.close();
  });

  it('isolates abort of one request from another', async () => {
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
    transport.enqueueJson(200, '{}');
    const client = createWiroClientForTests(
      {
        apiKey: 'key',
        retryPolicy: WiroRetryPolicy.none,
        transport,
      },
      {},
    );
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const pendingA = client.postJson(
      '/Tool/List',
      {},
      { signal: controllerA.signal },
    );
    const pendingB = client.postJson(
      '/Tool/Detail',
      {},
      { signal: controllerB.signal },
    );

    controllerA.abort('reason-a');

    await expect(pendingA).rejects.toBe('reason-a');
    await expect(pendingB).resolves.toEqual({});
    expect(transport.requests).toHaveLength(2);
    client.close();
  });

  it('preserves custom abort reasons and never retries them', async () => {
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
        retryPolicy: new WiroRetryPolicy({
          initialDelayMs: 10,
          maximumDelayMs: 100,
          maxRetries: 3,
          multiplier: 2,
          retryableStatusCodes: new Set([408, 429, 500, 502, 503, 504]),
        }),
        transport,
      },
      {},
    );
    const controller = new AbortController();
    const pending = client.postJson(
      '/Tool/List',
      {},
      { signal: controller.signal },
    );
    controller.abort({ custom: true });

    await expect(pending).rejects.toEqual({ custom: true });
    expect(transport.requests).toHaveLength(1);
    client.close();
  });
});

describe('Step 10 path and depth hardening', () => {
  it.each([
    '/Tool/List?x=1',
    '/Tool/List#frag',
    '/Tool/List\r\nX',
    '/Tool/List\0',
    '/Tool/../List',
    '/Tool/%2e%2e/List',
    '/Tool/%2e/List',
    '/Tool\\List',
  ])('rejects unsafe postJson path %j before networking', async (path) => {
    const transport = new FakeHttpTransport();
    const client = new WiroClient({
      apiKey: 'key',
      retryPolicy: WiroRetryPolicy.none,
      transport,
    });

    await expect(client.postJson(path)).rejects.toBeInstanceOf(
      WiroValidationError,
    );
    expect(transport.requests).toHaveLength(0);
    client.close();
  });

  it('rejects stringify depth overflow without networking', async () => {
    let nested: WiroValue = WiroValue.string('leaf');
    for (let depth = 0; depth <= MAX_WIRO_JSON_DEPTH; depth += 1) {
      nested = WiroValue.array([nested]);
    }
    const transport = new FakeHttpTransport();
    const client = new WiroClient({
      apiKey: 'key',
      retryPolicy: WiroRetryPolicy.none,
      transport,
    });

    await expect(client.postJson('/Tool/List', { nested })).rejects.toThrow(
      'JSON value exceeds the maximum nesting depth.',
    );
    expect(transport.requests).toHaveLength(0);
    expect(() => stringifyWiroJson({ nested })).toThrow(
      'JSON value exceeds the maximum nesting depth.',
    );
    client.close();
  });
});

describe('Step 10 WebSocket and REST body limits', () => {
  it('rejects oversized text frames before enqueue', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      {
        maxQueuedBytes: 64,
        maxTextBytes: 8,
        timeoutMs: 1_000,
      },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.message('0123456789');

    await expect(session.receiveFrame()).rejects.toThrow(
      'text frame that exceeds the size limit',
    );
  });

  it('rejects queued frames that exceed the byte budget', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      {
        maxQueuedBytes: 10,
        maxTextBytes: 64,
        timeoutMs: 1_000,
      },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.message('12345');
    socket.message('678901');

    expect(await session.receiveFrame()).toEqual({
      kind: 'text',
      text: '12345',
    });
    await expect(session.receiveFrame()).rejects.toThrow(
      'exceeded the queued frame budget',
    );
  });

  it('cancels streamed REST bodies when the byte limit is exceeded', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('abcdefghij'));
        controller.enqueue(encoder.encode('klmnopqrst'));
        controller.close();
      },
    });
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValue(
      new Response(stream, {
        status: 200,
      }),
    );
    const transport = new FetchWiroHttpTransport({
      fetchImplementation,
    });

    await expect(
      transport.perform(
        new WiroHttpRequest({
          body: '{}',
          headers: {},
          maxResponseBodyBytes: 12,
          method: 'POST',
          timeoutMs: 30_000,
          url: 'https://api.wiro.ai/v1/Tool/List',
        }),
      ),
    ).rejects.toThrow(
      'Response body exceeds the configured REST payload limit.',
    );
  });
});

describe('Step 10 redacted snapshots', () => {
  it('redacts tokens, file inputs, and raw payloads in JSON snapshots', () => {
    const token = new WiroTaskToken('secret-task-token');
    const task = WiroTask.parse(
      parseWiroJson(
        JSON.stringify({
          id: 'task-1',
          socketaccesstoken: token.rawValue,
          status: 'task_complete',
          pexit: 0,
        }),
      ),
    );
    const run = WiroRunResult.parse(
      parseWiroJson(
        JSON.stringify({
          result: true,
          socketaccesstoken: token.rawValue,
          taskid: 'task-1',
        }),
      ),
    );
    const message = WiroSocketMessage.parse(
      parseWiroJson(
        JSON.stringify({
          result: true,
          tasktoken: token.rawValue,
          type: 'task_output',
          message: 'hello',
        }),
      ),
    );
    const update = WiroTaskUpdate.snapshot(task);
    const fileInput = WiroFileInput.url('https://cdn.example/secret.png');
    const uriInput = WiroFileInput.uri('file:///tmp/secret.png');

    expect(task.raw.socketaccesstoken).toBeDefined();
    expect(task.taskToken?.rawValue).toBe('secret-task-token');
    expect(JSON.stringify(task)).not.toContain('secret-task-token');
    expect(JSON.stringify(task)).not.toContain('socketaccesstoken');
    expect(JSON.stringify(run)).not.toContain('secret-task-token');
    expect(JSON.stringify(message)).not.toContain('secret-task-token');
    expect(JSON.stringify(update)).not.toContain('secret-task-token');
    expect(JSON.stringify(fileInput)).not.toContain('cdn.example');
    expect(JSON.stringify(uriInput)).not.toContain('/tmp/secret.png');
    expect(JSON.stringify(WiroSocketEvent.binary(new Uint8Array([1, 2])))).toBe(
      '{"byteLength":2,"kind":"binary"}',
    );
    expect(new WiroTaskId('task-1').rawValue).toBe('task-1');
  });

  it('keeps process-wide nonce monotonic across injected clocks', () => {
    const runtime = createRuntimeDependencies({
      clock: {
        epochMilliseconds: () => 100,
      },
    });
    expect(runtime.nonceProvider.nextNonce()).toBe('100');
    expect(runtime.nonceProvider.nextNonce()).toBe('101');
  });
});

describe('Step 10 client limits configuration', () => {
  it('accepts tightened websocket and rest limits', () => {
    const limits = new WiroClientLimits({
      maxRestBodyBytes: 1_024,
      maxWebSocketBinaryBytes: 256,
      maxWebSocketTextBytes: 256,
    });
    const client = new WiroClient({
      apiKey: 'key',
      limits,
      transport: new FakeHttpTransport(),
    });
    expect(client.limits.maxWebSocketTextBytes).toBe(256);
    client.close();
  });
});

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  binaryType = 'blob';
  closeCount = 0;
  readonly sent: string[] = [];
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.closeCount += 1;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }
}

function installFakeWebSocket(): void {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (socket === undefined) {
    throw new Error('Expected a fake WebSocket instance.');
  }
  return socket;
}
