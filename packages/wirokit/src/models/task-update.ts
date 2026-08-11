import type { WiroTask } from './task';
import type { WiroTaskStatus } from './task-status';
import {
  WiroSocketBinaryEvent,
  type WiroSocketEvent,
  WiroSocketMessageEvent,
  type WiroSocketMessage,
} from './socket-event';

export const WiroTaskTrackingMode = Object.freeze({
  polling: 'polling',
  webSocket: 'webSocket',
} as const);

export type WiroTaskTrackingMode =
  (typeof WiroTaskTrackingMode)[keyof typeof WiroTaskTrackingMode];

export const WiroTracking = Object.freeze({
  defaultTimeoutMs: 600_000,
} as const);

export class WiroTaskSnapshotUpdate {
  readonly kind = 'snapshot';
  readonly task: WiroTask;

  constructor(task: WiroTask) {
    this.task = task;
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return this.task.status.isTerminal;
  }

  get status(): WiroTaskStatus {
    return this.task.status;
  }
}

export class WiroTaskEventUpdate {
  readonly kind = 'event';

  constructor(readonly message: WiroSocketMessage) {
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return this.message.status.isTerminal;
  }

  get status(): WiroTaskStatus {
    return this.message.status;
  }
}

export class WiroTaskBinaryUpdate {
  readonly kind = 'binary';
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = new Uint8Array(bytes);
    Object.freeze(this);
  }

  get bytes(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  get isTerminal(): boolean {
    return false;
  }

  get status(): undefined {
    return undefined;
  }
}

export type WiroTaskUpdate =
  WiroTaskSnapshotUpdate | WiroTaskEventUpdate | WiroTaskBinaryUpdate;

export const WiroTaskUpdate = Object.freeze({
  binary(bytes: Uint8Array): WiroTaskBinaryUpdate {
    return new WiroTaskBinaryUpdate(bytes);
  },
  event(message: WiroSocketMessage): WiroTaskEventUpdate {
    return new WiroTaskEventUpdate(message);
  },
  fromSocketEvent(event: WiroSocketEvent): WiroTaskUpdate {
    if (event instanceof WiroSocketMessageEvent) {
      return new WiroTaskEventUpdate(event.message);
    }
    if (event instanceof WiroSocketBinaryEvent) {
      return new WiroTaskBinaryUpdate(event.bytes);
    }
    return assertNever(event);
  },
  snapshot(task: WiroTask): WiroTaskSnapshotUpdate {
    return new WiroTaskSnapshotUpdate(task);
  },
});

function assertNever(value: never): never {
  throw new TypeError(`Unsupported socket event: ${String(value)}`);
}
