import {
  WiroWebSocketError,
  type WiroSocketConnectOptions,
  type WiroSocketFrame,
  type WiroSocketSession,
  type WiroSocketSessionFactory,
} from '../../src';
import { createAbortError } from '../../src/internal/runtime';

export type ScriptedSocketAction =
  | {
      readonly frame: WiroSocketFrame;
      readonly kind: 'frame';
    }
  | {
      readonly error: unknown;
      readonly kind: 'error';
    }
  | {
      readonly kind: 'pending';
    };

export class ScriptedSocketSession implements WiroSocketSession {
  readonly sentTexts: string[] = [];
  readonly #actions: ScriptedSocketAction[];
  readonly #onReceive: (() => void) | undefined;
  #closed = false;
  #closeCount = 0;

  constructor(
    actions: readonly ScriptedSocketAction[],
    onReceive?: () => void,
  ) {
    this.#actions = [...actions];
    this.#onReceive = onReceive;
  }

  get closeCount(): number {
    return this.#closeCount;
  }

  async sendText(text: string): Promise<void> {
    if (this.#closed) {
      throw new WiroWebSocketError('Failed to send a WebSocket frame.');
    }
    this.sentTexts.push(text);
  }

  async receiveFrame(signal?: AbortSignal): Promise<WiroSocketFrame> {
    this.#onReceive?.();
    if (signal?.aborted === true) {
      throw signal.reason ?? createAbortError();
    }
    const action = this.#actions.shift() ?? {
      kind: 'pending',
    };
    if (action.kind === 'frame') {
      return action.frame;
    }
    if (action.kind === 'error') {
      throw action.error;
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

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#closeCount += 1;
  }
}

export class ScriptedSocketFactory implements WiroSocketSessionFactory {
  readonly connections: {
    readonly options: WiroSocketConnectOptions;
    readonly url: string;
  }[] = [];
  readonly #sessions: ScriptedSocketSession[];

  constructor(sessions: readonly ScriptedSocketSession[]) {
    this.#sessions = [...sessions];
  }

  async connect(
    url: string,
    options: WiroSocketConnectOptions,
  ): Promise<WiroSocketSession> {
    this.connections.push({ options, url });
    const session = this.#sessions.shift();
    if (session === undefined) {
      throw new WiroWebSocketError(
        'The Wiro task WebSocket failed.',
        'MissingScript',
      );
    }
    return session;
  }
}

export function textFrame(value: unknown): ScriptedSocketAction {
  return {
    frame: {
      kind: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value),
    },
    kind: 'frame',
  };
}

export function binaryFrame(bytes: Uint8Array): ScriptedSocketAction {
  return {
    frame: {
      bytes,
      kind: 'binary',
    },
    kind: 'frame',
  };
}

export function socketClose(): ScriptedSocketAction {
  return {
    error: new WiroWebSocketError(
      'The Wiro task WebSocket closed before a terminal event.',
    ),
    kind: 'error',
  };
}
