import { describe, expect, it } from 'vitest';

import {
  WiroClient,
  WiroClientLimits,
  WiroModelId,
  WiroSocketBinaryEvent,
  WiroSocketMessageEvent,
  WiroTaskBinaryUpdate,
  WiroTaskEventUpdate,
  WiroTaskSnapshotUpdate,
  WiroTaskToken,
  WiroTimeoutError,
  WiroWebSocketError,
  type WiroSocketSession,
  type WiroSocketSessionFactory,
} from '../src';
import {
  createWiroClientForTests,
  taskInfoHandshakeJson,
} from '../src/client/wiro-client';
import { createAbortError } from '../src/internal/runtime';
import type { WiroRuntimeOverrides } from '../src/internal/runtime';
import { FakeHttpTransport } from './support/fake-http-transport';
import {
  binaryFrame,
  ScriptedSocketFactory,
  ScriptedSocketSession,
  socketClose,
  textFrame,
} from './support/scripted-socket-session';

describe('watchTaskSocket', () => {
  it('connects, sends the exact handshake, and closes on terminal', async () => {
    const session = new ScriptedSocketSession([
      textFrame({
        message: 'running',
        type: 'task_start',
      }),
      textFrame({
        message: [],
        type: 'task_postprocess_end',
      }),
    ]);
    const factory = new ScriptedSocketFactory([session]);
    const sdk = socketClient(factory);

    const events = await collect(
      sdk.watchTaskSocket(new WiroTaskToken('tok-abc')),
    );

    expect(session.sentTexts).toEqual([
      '{"type":"task_info","tasktoken":"tok-abc"}',
    ]);
    expect(factory.connections).toEqual([
      {
        options: expect.objectContaining({
          timeoutMs: 30_000,
        }),
        url: 'wss://socket.wiro.ai/v1',
      },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toBeInstanceOf(WiroSocketMessageEvent);
    expect(events[1]?.isTerminal).toBe(true);
    expect(session.closeCount).toBe(1);
  });

  it('escapes token backslashes and quotes in the handshake', () => {
    expect(taskInfoHandshakeJson(new WiroTaskToken('a\\b"c'))).toBe(
      '{"type":"task_info","tasktoken":"a\\\\b\\"c"}',
    );
  });

  it('emits binary and cancelled events in order', async () => {
    const session = new ScriptedSocketSession([
      binaryFrame(new Uint8Array([1, 2, 3])),
      textFrame({
        message: 'cancelled',
        type: 'task_cancel',
      }),
    ]);

    const events = await collect(
      socketClient(new ScriptedSocketFactory([session])).watchTaskSocket(
        token(),
      ),
    );

    expect(events[0]).toBeInstanceOf(WiroSocketBinaryEvent);
    if (events[0] instanceof WiroSocketBinaryEvent) {
      expect(events[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
    }
    expect(events[1]?.isTerminal).toBe(true);
    expect(session.closeCount).toBe(1);
  });

  it('closes and reports invalid JSON', async () => {
    const session = new ScriptedSocketSession([textFrame('{')]);

    await expect(
      collect(
        socketClient(new ScriptedSocketFactory([session])).watchTaskSocket(
          token(),
        ),
      ),
    ).rejects.toThrow('The Wiro task WebSocket returned invalid JSON.');
    expect(session.closeCount).toBe(1);
  });

  it('enforces configured frame limits and closes', async () => {
    const textSession = new ScriptedSocketSession([textFrame('{}')]);
    const binarySession = new ScriptedSocketSession([
      binaryFrame(new Uint8Array(5)),
    ]);
    const limits = new WiroClientLimits({
      maxWebSocketBinaryBytes: 4,
      maxWebSocketTextBytes: 1,
    });

    await expect(
      collect(
        socketClient(new ScriptedSocketFactory([textSession]), {
          limits,
        }).watchTaskSocket(token()),
      ),
    ).rejects.toThrow('text frame that exceeds');
    await expect(
      collect(
        socketClient(new ScriptedSocketFactory([binarySession]), {
          limits,
        }).watchTaskSocket(token()),
      ),
    ).rejects.toThrow('binary frame that exceeds');
    expect(textSession.closeCount).toBe(1);
    expect(binarySession.closeCount).toBe(1);
  });

  it('times out deterministically and closes', async () => {
    const session = new ScriptedSocketSession([{ kind: 'pending' }]);
    const slept: number[] = [];
    let now = 0;
    const sdk = socketClient(new ScriptedSocketFactory([session]), {
      runtime: {
        delay: {
          async sleep(durationMs: number): Promise<void> {
            slept.push(durationMs);
            now += durationMs;
          },
        },
        monotonicClock: {
          milliseconds: () => now,
        },
      },
    });

    await expect(
      collect(
        sdk.watchTaskSocket(token(), {
          timeoutMs: 5_000,
        }),
      ),
    ).rejects.toMatchObject({
      message: 'Task socket did not finish within 5000 ms.',
      timeoutMs: 5_000,
    });
    expect(slept).toEqual([5_000]);
    expect(session.closeCount).toBe(1);
  });

  it('preserves AbortError and closes without fallback', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('stop', 'AbortError');
    const session = new ScriptedSocketSession([{ kind: 'pending' }], () =>
      controller.abort(abortError),
    );

    await expect(
      collect(
        socketClient(new ScriptedSocketFactory([session])).watchTaskSocket(
          token(),
          {
            signal: controller.signal,
          },
        ),
      ),
    ).rejects.toBe(abortError);
    expect(session.closeCount).toBe(1);
  });

  it('validates timeout before connecting', () => {
    const factory = new ScriptedSocketFactory([]);
    const sdk = socketClient(factory);

    expect(() => sdk.watchTaskSocket(token(), { timeoutMs: 0 })).toThrow(
      'timeout must be finite and greater than zero.',
    );
    expect(factory.connections).toHaveLength(0);
  });
});

describe('WebSocket subscriptions', () => {
  it('emits socket events then the canonical terminal snapshot', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const session = new ScriptedSocketSession([
      textFrame({
        message: 'running',
        type: 'task_start',
      }),
      textFrame({
        message: [],
        type: 'task_postprocess_end',
      }),
    ]);
    const updates: unknown[] = [];

    const result = await socketClient(new ScriptedSocketFactory([session]), {
      transport,
    }).subscribe(
      new WiroModelId('owner', 'project'),
      {},
      {
        onUpdate(update) {
          updates.push(update);
        },
        trackingMode: 'webSocket',
      },
    );

    expect(result.kind).toBe('success');
    expect(updates).toHaveLength(3);
    expect(updates[0]).toBeInstanceOf(WiroTaskEventUpdate);
    expect(updates[1]).toBeInstanceOf(WiroTaskEventUpdate);
    expect(updates[2]).toBeInstanceOf(WiroTaskSnapshotUpdate);
    expect((updates[2] as WiroTaskSnapshotUpdate).isTerminal).toBe(true);
    expect(runRequestCount(transport)).toBe(1);
    expect(transport.requests).toHaveLength(2);
    expect(session.closeCount).toBe(1);
  });

  it('falls back after early close without repeating Run', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_start'));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const session = new ScriptedSocketSession([socketClose()]);
    const updates: unknown[] = [];

    const result = await socketClient(new ScriptedSocketFactory([session]), {
      transport,
    }).subscribe(
      new WiroModelId('owner', 'project'),
      {},
      {
        onUpdate(update) {
          updates.push(update);
        },
        trackingMode: 'webSocket',
      },
    );

    expect(result.kind).toBe('success');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toBeInstanceOf(WiroTaskSnapshotUpdate);
    expect(runRequestCount(transport)).toBe(1);
    expect(transport.requests).toHaveLength(3);
    expect(session.closeCount).toBe(1);
  });

  it('falls back after connection and send failures', async () => {
    const connectionTransport = new FakeHttpTransport();
    connectionTransport.enqueueJson(200, runResponse());
    connectionTransport.enqueueJson(
      200,
      taskResponse('task_postprocess_end', 0),
    );
    const failingFactory: WiroSocketSessionFactory = {
      async connect(): Promise<never> {
        throw new TypeError('connect failed');
      },
    };

    const connectionResult = await socketClient(failingFactory, {
      transport: connectionTransport,
    }).subscribe(
      new WiroModelId('owner', 'project'),
      {},
      {
        trackingMode: 'webSocket',
      },
    );
    expect(connectionResult.kind).toBe('success');

    const sendTransport = new FakeHttpTransport();
    sendTransport.enqueueJson(200, runResponse());
    sendTransport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const sendFailureFactory: WiroSocketSessionFactory = {
      async connect(): Promise<WiroSocketSession> {
        return {
          async close(): Promise<void> {
            throw new Error('close failed');
          },
          async receiveFrame(): Promise<never> {
            throw new Error('must not receive');
          },
          async sendText(): Promise<void> {
            throw new TypeError('send failed');
          },
        };
      },
    };

    const sendResult = await socketClient(sendFailureFactory, {
      transport: sendTransport,
    }).subscribe(
      new WiroModelId('owner', 'project'),
      {},
      {
        trackingMode: 'webSocket',
      },
    );
    expect(sendResult.kind).toBe('success');
    expect(runRequestCount(connectionTransport)).toBe(1);
    expect(runRequestCount(sendTransport)).toBe(1);
  });

  it('uses only remaining timeout during fallback polling', async () => {
    let now = 0;
    let delayCall = 0;
    const slept: number[] = [];
    const session: WiroSocketSession = {
      async close(): Promise<void> {},
      async receiveFrame(): Promise<never> {
        now += 1_000;
        throw new WiroWebSocketError(
          'The Wiro task WebSocket closed before a terminal event.',
        );
      },
      async sendText(): Promise<void> {},
    };
    const factory: WiroSocketSessionFactory = {
      async connect(): Promise<WiroSocketSession> {
        return session;
      },
    };
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_start'));
    transport.enqueueJson(200, taskResponse('task_start'));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));

    const result = await socketClient(factory, {
      runtime: {
        delay: {
          sleep(durationMs: number, signal?: AbortSignal): Promise<void> {
            delayCall += 1;
            if (delayCall === 1) {
              return pendingUntilAbort(signal);
            }
            slept.push(durationMs);
            now += durationMs;
            return Promise.resolve();
          },
        },
        monotonicClock: {
          milliseconds: () => now,
        },
      },
      transport,
    }).subscribe(
      new WiroModelId('owner', 'project'),
      {},
      {
        timeoutMs: 5_000,
        trackingMode: 'webSocket',
      },
    );

    expect(result.kind).toBe('success');
    expect(slept).toEqual([3_000]);
    expect(slept[0]).toBeLessThanOrEqual(4_000);
    expect(runRequestCount(transport)).toBe(1);
  });

  it('times out when early close consumes the full budget', async () => {
    let now = 0;
    const session: WiroSocketSession = {
      async close(): Promise<void> {},
      async receiveFrame(): Promise<never> {
        now = 5_000;
        throw new WiroWebSocketError(
          'The Wiro task WebSocket closed before a terminal event.',
        );
      },
      async sendText(): Promise<void> {},
    };
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_start'));

    await expect(
      socketClient(
        {
          async connect(): Promise<WiroSocketSession> {
            return session;
          },
        },
        {
          runtime: {
            delay: {
              sleep(_durationMs: number, signal?: AbortSignal): Promise<void> {
                return pendingUntilAbort(signal);
              },
            },
            monotonicClock: {
              milliseconds: () => now,
            },
          },
          transport,
        },
      ).subscribe(
        new WiroModelId('owner', 'project'),
        {},
        {
          timeoutMs: 5_000,
          trackingMode: 'webSocket',
        },
      ),
    ).rejects.toMatchObject({
      message: 'Task did not finish within 5000 ms.',
      timeoutMs: 5_000,
    });
    expect(transport.requests).toHaveLength(2);
  });

  it('does not fall back after a socket timeout', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    const session = new ScriptedSocketSession([{ kind: 'pending' }]);
    let now = 0;

    await expect(
      socketClient(new ScriptedSocketFactory([session]), {
        runtime: {
          delay: {
            async sleep(durationMs: number): Promise<void> {
              now += durationMs;
            },
          },
          monotonicClock: {
            milliseconds: () => now,
          },
        },
        transport,
      }).subscribe(
        new WiroModelId('owner', 'project'),
        {},
        {
          timeoutMs: 1_000,
          trackingMode: 'webSocket',
        },
      ),
    ).rejects.toBeInstanceOf(WiroTimeoutError);
    expect(transport.requests).toHaveLength(1);
    expect(session.closeCount).toBe(1);
  });

  it('does not fetch task detail after socket abort', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    const controller = new AbortController();
    const abortError = new DOMException('stop', 'AbortError');
    const session = new ScriptedSocketSession([{ kind: 'pending' }], () =>
      controller.abort(abortError),
    );

    await expect(
      socketClient(new ScriptedSocketFactory([session]), {
        transport,
      }).subscribe(
        new WiroModelId('owner', 'project'),
        {},
        {
          signal: controller.signal,
          trackingMode: 'webSocket',
        },
      ),
    ).rejects.toBe(abortError);
    expect(transport.requests).toHaveLength(1);
    expect(session.closeCount).toBe(1);
  });

  it('re-consumes a stream without starting another Run', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const first = terminalSession();
    const second = terminalSession();
    const stream = await socketClient(
      new ScriptedSocketFactory([first, second]),
      { transport },
    ).subscribeStream(
      new WiroModelId('owner', 'project'),
      {},
      { trackingMode: 'webSocket' },
    );

    const firstUpdates = await collect(stream);
    const secondUpdates = await collect(stream);

    expect(firstUpdates).toHaveLength(2);
    expect(secondUpdates).toHaveLength(2);
    expect(firstUpdates[0]).toBeInstanceOf(WiroTaskEventUpdate);
    expect(firstUpdates[1]).toBeInstanceOf(WiroTaskSnapshotUpdate);
    expect(runRequestCount(transport)).toBe(1);
    expect(transport.requests).toHaveLength(3);
  });

  it('preserves binary updates before canonical completion', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, runResponse());
    transport.enqueueJson(200, taskResponse('task_postprocess_end', 0));
    const session = new ScriptedSocketSession([
      binaryFrame(new Uint8Array([9])),
      textFrame({
        message: [],
        type: 'task_postprocess_end',
      }),
    ]);
    const stream = await socketClient(new ScriptedSocketFactory([session]), {
      transport,
    }).subscribeStream(
      new WiroModelId('owner', 'project'),
      {},
      { trackingMode: 'webSocket' },
    );

    const updates = await collect(stream);
    expect(updates[0]).toBeInstanceOf(WiroTaskBinaryUpdate);
    expect(updates.at(-1)).toBeInstanceOf(WiroTaskSnapshotUpdate);
  });
});

describe('socket URL routing', () => {
  it('uses socketUrl instead of the proxy HTTP URL', async () => {
    const transport = new FakeHttpTransport();
    const session = terminalSession();
    const factory = new ScriptedSocketFactory([session]);
    const sdk = new WiroClient({
      headers: {
        Authorization: 'Bearer short-lived',
      },
      proxyUrl: 'https://proxy.example.com/wiro',
      socketSessionFactory: factory,
      transport,
    });

    await collect(sdk.watchTaskSocket(token()));

    expect(factory.connections[0]?.url).toBe('wss://socket.wiro.ai/v1');
  });
});

function socketClient(
  factory: WiroSocketSessionFactory,
  options: {
    readonly limits?: WiroClientLimits;
    readonly runtime?: WiroRuntimeOverrides;
    readonly transport?: FakeHttpTransport;
  } = {},
): WiroClient {
  return createWiroClientForTests(
    {
      apiKey: 'test-api-key',
      ...(options.limits === undefined ? {} : { limits: options.limits }),
      socketSessionFactory: factory,
      transport: options.transport ?? new FakeHttpTransport(),
    },
    options.runtime ?? {
      delay: {
        sleep(_durationMs: number, signal?: AbortSignal): Promise<void> {
          return pendingUntilAbort(signal);
        },
      },
      monotonicClock: {
        milliseconds: () => 0,
      },
    },
  );
}

function terminalSession(): ScriptedSocketSession {
  return new ScriptedSocketSession([
    textFrame({
      message: [],
      type: 'task_postprocess_end',
    }),
  ]);
}

function token(): WiroTaskToken {
  return new WiroTaskToken('task-token');
}

function runResponse(): string {
  return JSON.stringify({
    result: true,
    socketaccesstoken: token().rawValue,
    taskid: 'task-id',
  });
}

function taskResponse(status: string, exitCode?: number): string {
  return JSON.stringify({
    result: true,
    tasklist: [
      {
        id: 'task-id',
        ...(exitCode === undefined ? {} : { pexit: exitCode }),
        socketaccesstoken: token().rawValue,
        status,
      },
    ],
  });
}

function pendingUntilAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted === true) {
    return Promise.reject(signal.reason ?? createAbortError());
  }
  return new Promise((_, reject) => {
    const abort = (): void => {
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason ?? createAbortError());
    };
    signal?.addEventListener('abort', abort, {
      once: true,
    });
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function runRequestCount(transport: FakeHttpTransport): number {
  return transport.requests.filter((request) => request.url.includes('/Run/'))
    .length;
}
