import { WiroValidationError, WiroWebSocketError } from '../errors/wiro-error';
import { createAbortError } from '../internal/runtime';
import { utf8ByteLength } from '../internal/utf8';
import { requirePositiveDuration } from '../internal/validation';

export type WiroSocketFrame =
  | {
      readonly bytes: Uint8Array;
      readonly kind: 'binary';
    }
  | {
      readonly kind: 'text';
      readonly text: string;
    };

export interface WiroSocketSession {
  close(): Promise<void>;
  receiveFrame(signal?: AbortSignal): Promise<WiroSocketFrame>;
  sendText(text: string): Promise<void>;
}

export interface WiroSocketConnectOptions {
  readonly maxBinaryBytes?: number;
  readonly maxQueuedBytes?: number;
  readonly maxTextBytes?: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}

export interface WiroSocketSessionFactory {
  connect(
    url: string,
    options: WiroSocketConnectOptions,
  ): Promise<WiroSocketSession>;
}

interface FrameWaiter {
  readonly reject: (error: unknown) => void;
  readonly resolve: (frame: WiroSocketFrame) => void;
  readonly signal: AbortSignal | undefined;
  readonly abort: () => void;
}

interface SocketFrameLimits {
  readonly maxBinaryBytes: number;
  readonly maxQueuedBytes: number;
  readonly maxTextBytes: number;
}

const DEFAULT_MAX_TEXT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_BINARY_BYTES = 8 * 1024 * 1024;

export class ExpoWiroSocketSessionFactory implements WiroSocketSessionFactory {
  async connect(
    url: string,
    options: WiroSocketConnectOptions,
  ): Promise<WiroSocketSession> {
    requirePositiveDuration(options.timeoutMs, 'timeout');
    if (options.signal?.aborted === true) {
      throw options.signal.reason ?? createAbortError();
    }
    if (typeof WebSocket !== 'function') {
      throw new WiroValidationError('A WebSocket implementation is required.');
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
    } catch (error) {
      throw socketFailure(error);
    }
    const session = new ExpoWiroSocketSession(
      socket,
      resolveFrameLimits(options),
    );
    try {
      await session.waitUntilOpen(options);
      return session;
    } catch (error) {
      await session.close();
      throw error;
    }
  }
}

class ExpoWiroSocketSession implements WiroSocketSession {
  readonly #frames: WiroSocketFrame[] = [];
  readonly #limits: SocketFrameLimits;
  readonly #openPromise: Promise<void>;
  readonly #socket: WebSocket;
  readonly #waiters: FrameWaiter[] = [];
  #closed = false;
  #openReject: ((error: unknown) => void) | undefined;
  #openResolve: (() => void) | undefined;
  #queuedBytes = 0;
  #terminalError: unknown;

  constructor(socket: WebSocket, limits: SocketFrameLimits) {
    this.#socket = socket;
    this.#limits = limits;
    this.#openPromise = new Promise<void>((resolve, reject) => {
      this.#openResolve = resolve;
      this.#openReject = reject;
    });
    socket.onopen = () => {
      this.#openResolve?.();
      this.#openResolve = undefined;
      this.#openReject = undefined;
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      this.enqueueMessage(event.data);
    };
    socket.onerror = () => {
      this.fail(
        new WiroWebSocketError(
          'The Wiro task WebSocket failed.',
          'WebSocketError',
        ),
      );
    };
    socket.onclose = () => {
      this.fail(
        new WiroWebSocketError(
          'The Wiro task WebSocket closed before a terminal event.',
        ),
      );
    };
  }

  async waitUntilOpen(options: WiroSocketConnectOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        callback();
      };
      const abort = (): void => {
        finish(() => {
          reject(options.signal?.reason ?? createAbortError());
        });
      };
      const timer = setTimeout(() => {
        finish(() => {
          reject(
            new WiroWebSocketError(
              'The Wiro task WebSocket failed.',
              'TimeoutError',
            ),
          );
        });
      }, options.timeoutMs);
      if (options.signal?.aborted === true) {
        abort();
      } else {
        options.signal?.addEventListener('abort', abort, {
          once: true,
        });
      }
      this.#openPromise.then(
        () => finish(resolve),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  async sendText(text: string): Promise<void> {
    if (this.#closed) {
      throw new WiroWebSocketError(
        'Failed to send a WebSocket frame.',
        'WebSocketClosed',
      );
    }
    try {
      this.#socket.send(text);
    } catch (error) {
      throw new WiroWebSocketError(
        'Failed to send a WebSocket frame.',
        errorTypeName(error),
      );
    }
  }

  receiveFrame(signal?: AbortSignal): Promise<WiroSocketFrame> {
    if (signal?.aborted === true) {
      return Promise.reject(signal.reason ?? createAbortError());
    }
    const frame = this.#frames.shift();
    if (frame !== undefined) {
      this.#queuedBytes -= frameByteLength(frame);
      return Promise.resolve(frame);
    }
    if (this.#terminalError !== undefined) {
      return Promise.reject(this.#terminalError);
    }

    return new Promise((resolve, reject) => {
      const waiter: FrameWaiter = {
        abort: () => {
          const index = this.#waiters.indexOf(waiter);
          if (index >= 0) {
            this.#waiters.splice(index, 1);
          }
          signal?.removeEventListener('abort', waiter.abort);
          reject(signal?.reason ?? createAbortError());
        },
        reject,
        resolve,
        signal,
      };
      this.#waiters.push(waiter);
      signal?.addEventListener('abort', waiter.abort, {
        once: true,
      });
    });
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    try {
      this.#socket.close(1001, '');
    } catch {
      // Best-effort cleanup.
    }
    this.fail(
      new WiroWebSocketError(
        'The Wiro task WebSocket closed before a terminal event.',
      ),
    );
  }

  private enqueueMessage(data: unknown): void {
    if (typeof data === 'string') {
      if (utf8ByteLength(data) > this.#limits.maxTextBytes) {
        this.fail(
          new WiroWebSocketError(
            'The Wiro task WebSocket returned a text frame ' +
              'that exceeds the size limit.',
          ),
        );
        return;
      }
      this.enqueueFrame({
        kind: 'text',
        text: data,
      });
      return;
    }
    if (data instanceof ArrayBuffer) {
      this.enqueueBinary(new Uint8Array(data));
      return;
    }
    if (ArrayBuffer.isView(data)) {
      this.enqueueBinary(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      return;
    }
    this.fail(
      new WiroWebSocketError(
        'The Wiro task WebSocket returned an unsupported frame type.',
      ),
    );
  }

  private enqueueBinary(bytes: Uint8Array): void {
    if (bytes.byteLength > this.#limits.maxBinaryBytes) {
      this.fail(
        new WiroWebSocketError(
          'The Wiro task WebSocket returned a binary frame ' +
            'that exceeds the size limit.',
        ),
      );
      return;
    }
    this.enqueueFrame({
      bytes: new Uint8Array(bytes),
      kind: 'binary',
    });
  }

  private enqueueFrame(frame: WiroSocketFrame): void {
    const waiter = this.#waiters.shift();
    if (waiter === undefined) {
      const size = frameByteLength(frame);
      if (this.#queuedBytes + size > this.#limits.maxQueuedBytes) {
        this.fail(
          new WiroWebSocketError(
            'The Wiro task WebSocket exceeded the queued frame budget.',
          ),
        );
        return;
      }
      this.#queuedBytes += size;
      this.#frames.push(frame);
      return;
    }
    waiter.signal?.removeEventListener('abort', waiter.abort);
    waiter.resolve(frame);
  }

  private fail(error: unknown): void {
    if (this.#terminalError === undefined) {
      this.#terminalError = error;
    }
    this.#openReject?.(this.#terminalError);
    this.#openResolve = undefined;
    this.#openReject = undefined;
    for (const waiter of this.#waiters.splice(0)) {
      waiter.signal?.removeEventListener('abort', waiter.abort);
      waiter.reject(this.#terminalError);
    }
  }
}

function resolveFrameLimits(
  options: WiroSocketConnectOptions,
): SocketFrameLimits {
  const maxTextBytes = options.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES;
  const maxBinaryBytes = options.maxBinaryBytes ?? DEFAULT_MAX_BINARY_BYTES;
  return {
    maxBinaryBytes,
    maxQueuedBytes: options.maxQueuedBytes ?? maxTextBytes + maxBinaryBytes,
    maxTextBytes,
  };
}

function frameByteLength(frame: WiroSocketFrame): number {
  return frame.kind === 'binary'
    ? frame.bytes.byteLength
    : utf8ByteLength(frame.text);
}

function socketFailure(error: unknown): WiroWebSocketError {
  return new WiroWebSocketError(
    'The Wiro task WebSocket failed.',
    errorTypeName(error),
  );
}

function errorTypeName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error';
}
