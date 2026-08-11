import type { WiroTask } from './task';
import type { WiroTaskStatus } from './task-status';

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

export type WiroTaskUpdate = WiroTaskSnapshotUpdate;

export const WiroTaskUpdate = Object.freeze({
  snapshot(task: WiroTask): WiroTaskSnapshotUpdate {
    return new WiroTaskSnapshotUpdate(task);
  },
});
