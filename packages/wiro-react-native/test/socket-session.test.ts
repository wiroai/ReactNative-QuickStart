import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExpoWiroSocketSessionFactory,
  WiroValidationError,
  WiroWebSocketError,
} from '../src';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static onConstruct: (() => void) | undefined;

  binaryType = 'blob';
  closeCount = 0;
  readonly sent: string[] = [];
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  throwOnClose = false;
  throwOnSend = false;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    FakeWebSocket.onConstruct?.();
  }

  send(text: string): void {
    if (this.throwOnSend) {
      throw new TypeError('send failed');
    }
    this.sent.push(text);
  }

  close(): void {
    this.closeCount += 1;
    if (this.throwOnClose) {
      throw new Error('close failed');
    }
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  error(): void {
    this.onerror?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeWebSocket.instances = [];
  FakeWebSocket.onConstruct = undefined;
});

describe('ExpoWiroSocketSessionFactory', () => {
  it('opens standard WebSocket and transfers text and binary frames', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;

    await session.sendText('handshake');
    socket.message('{"type":"task_start"}');
    expect(await session.receiveFrame()).toEqual({
      kind: 'text',
      text: '{"type":"task_start"}',
    });
    socket.message(new Uint8Array([1, 2]).buffer);
    expect(await session.receiveFrame()).toEqual({
      bytes: new Uint8Array([1, 2]),
      kind: 'binary',
    });
    socket.message(new Uint8Array([0, 3, 4, 0]).subarray(1, 3));
    expect(await session.receiveFrame()).toEqual({
      bytes: new Uint8Array([3, 4]),
      kind: 'binary',
    });
    const waiting = session.receiveFrame();
    socket.message('delivered-to-waiter');
    expect(await waiting).toEqual({
      kind: 'text',
      text: 'delivered-to-waiter',
    });
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.sent).toEqual(['handshake']);

    await session.close();
    await session.close();
    expect(socket.closeCount).toBe(1);
  });

  it('rejects unsupported frames and socket errors', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.message({ unsupported: true });

    await expect(session.receiveFrame()).rejects.toThrow(
      'The Wiro task WebSocket returned an unsupported frame type.',
    );
  });

  it('maps open failures and performs cleanup', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const rejected =
      expect(connecting).rejects.toBeInstanceOf(WiroWebSocketError);
    const socket = latestSocket();
    socket.error();

    await rejected;
    expect(socket.closeCount).toBe(1);
  });

  it('times out connection attempts', async () => {
    vi.useFakeTimers();
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 50 },
    );
    const rejected = expect(connecting).rejects.toMatchObject({
      underlyingType: 'TimeoutError',
    });

    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(latestSocket().closeCount).toBe(1);
  });

  it('preserves abort while connecting and receiving', async () => {
    installFakeWebSocket();
    const connectController = new AbortController();
    const abortError = new DOMException('stop', 'AbortError');
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      {
        signal: connectController.signal,
        timeoutMs: 1_000,
      },
    );
    const connectRejected = expect(connecting).rejects.toBe(abortError);
    connectController.abort(abortError);
    await connectRejected;

    const secondConnecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await secondConnecting;
    const receiveController = new AbortController();
    const receiving = session.receiveFrame(receiveController.signal);
    const receiveRejected = expect(receiving).rejects.toBe(abortError);
    receiveController.abort(abortError);

    await receiveRejected;
    await session.close();
  });

  it('rejects pre-aborted connect and receive operations', async () => {
    installFakeWebSocket();
    const controller = new AbortController();
    const reason = new DOMException('stop', 'AbortError');
    controller.abort(reason);

    await expect(
      new ExpoWiroSocketSessionFactory().connect('wss://socket.wiro.ai/v1', {
        signal: controller.signal,
        timeoutMs: 1_000,
      }),
    ).rejects.toBe(reason);
    expect(FakeWebSocket.instances).toHaveLength(0);

    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    await expect(session.receiveFrame(controller.signal)).rejects.toBe(reason);
    await session.close();
  });

  it('handles abort between construction and open waiting', async () => {
    installFakeWebSocket();
    const controller = new AbortController();
    const reason = new DOMException('stop', 'AbortError');
    FakeWebSocket.onConstruct = () => {
      controller.abort(reason);
    };

    await expect(
      new ExpoWiroSocketSessionFactory().connect('wss://socket.wiro.ai/v1', {
        signal: controller.signal,
        timeoutMs: 1_000,
      }),
    ).rejects.toBe(reason);
    expect(latestSocket().closeCount).toBe(1);
  });

  it('rejects receives after remote close', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.onclose?.();

    await expect(session.receiveFrame()).rejects.toThrow(
      'closed before a terminal event',
    );
  });

  it('maps send failures and closed sends', async () => {
    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.throwOnSend = true;

    await expect(session.sendText('handshake')).rejects.toMatchObject({
      message: 'Failed to send a WebSocket frame.',
      underlyingType: 'TypeError',
    });
    socket.throwOnSend = false;
    await session.close();
    await expect(session.sendText('after-close')).rejects.toThrow(
      'Failed to send a WebSocket frame.',
    );
  });

  it('requires WebSocket and validates connect timeout', async () => {
    vi.stubGlobal('WebSocket', undefined);
    await expect(
      new ExpoWiroSocketSessionFactory().connect('wss://socket.wiro.ai/v1', {
        timeoutMs: 1_000,
      }),
    ).rejects.toBeInstanceOf(WiroValidationError);
    await expect(
      new ExpoWiroSocketSessionFactory().connect('wss://socket.wiro.ai/v1', {
        timeoutMs: 0,
      }),
    ).rejects.toThrow('timeout must be finite and greater than zero.');
  });

  it('maps constructor failures and tolerates close failures', async () => {
    class ThrowingWebSocket {
      constructor() {
        throw 'constructor failed';
      }
    }
    vi.stubGlobal(
      'WebSocket',
      ThrowingWebSocket as unknown as typeof WebSocket,
    );
    await expect(
      new ExpoWiroSocketSessionFactory().connect('wss://socket.wiro.ai/v1', {
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      underlyingType: 'Error',
    });

    installFakeWebSocket();
    const connecting = new ExpoWiroSocketSessionFactory().connect(
      'wss://socket.wiro.ai/v1',
      { timeoutMs: 1_000 },
    );
    const socket = latestSocket();
    socket.open();
    const session = await connecting;
    socket.throwOnClose = true;
    await expect(session.close()).resolves.toBeUndefined();
  });
});

function installFakeWebSocket(): void {
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
}

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (socket === undefined) {
    throw new Error('Expected a fake WebSocket instance.');
  }
  return socket;
}
