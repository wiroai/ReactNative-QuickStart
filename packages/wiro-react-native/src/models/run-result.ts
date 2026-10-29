import { WiroTaskId, WiroTaskToken } from '../core/identifiers';
import type { WiroJson } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readBoolean,
  readString,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';
import { WiroApiError } from './pagination';
import type { WiroTask } from './task';

export interface WiroRunResultOptions {
  readonly errors?: readonly WiroApiError[];
  readonly isSuccess: boolean;
  readonly raw: WiroJson;
  readonly taskId?: WiroTaskId | undefined;
  readonly taskToken?: WiroTaskToken | undefined;
}

export class WiroRunResult {
  readonly errors: readonly WiroApiError[];
  readonly isSuccess: boolean;
  readonly raw: WiroJson;
  readonly taskId: WiroTaskId | undefined;
  readonly taskToken: WiroTaskToken | undefined;

  constructor(options: WiroRunResultOptions) {
    this.errors = immutableArray(options.errors ?? []);
    this.isSuccess = options.isSuccess;
    this.raw = immutableJson(options.raw);
    this.taskId = options.taskId;
    this.taskToken = options.taskToken;
    Object.freeze(this);
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      errors: this.errors,
      isSuccess: this.isSuccess,
      taskId: this.taskId,
      taskToken: this.taskToken === undefined ? undefined : '[REDACTED]',
    });
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroRunResult {
    return new WiroRunResult({
      errors: WiroApiError.parseList(json.errors, onMalformedJson),
      isSuccess: readBoolean(json.result) ?? false,
      raw: json,
      taskId: WiroTaskId.parse(readString(json.taskid) ?? '') ?? undefined,
      taskToken:
        WiroTaskToken.parse(readString(json.socketaccesstoken) ?? '') ??
        undefined,
    });
  }
}

export const WiroTaskFailureReason = Object.freeze({
  cancelled: 'cancelled',
  nonZeroExit: 'nonZeroExit',
  other: 'other',
} as const);

export type WiroTaskFailureReason =
  (typeof WiroTaskFailureReason)[keyof typeof WiroTaskFailureReason];

export class WiroTaskSuccess {
  readonly kind = 'success';
  readonly task: WiroTask;

  constructor(task: WiroTask) {
    this.task = task;
    Object.freeze(this);
  }
}

export class WiroTaskFailure {
  readonly kind = 'failure';
  readonly reason: WiroTaskFailureReason;
  readonly task: WiroTask;

  constructor(task: WiroTask, reason: WiroTaskFailureReason) {
    this.reason = reason;
    this.task = task;
    Object.freeze(this);
  }
}

export type WiroTaskResult = WiroTaskSuccess | WiroTaskFailure;

export const WiroTaskResult = Object.freeze({
  from(task: WiroTask): WiroTaskResult {
    if (task.isSuccessful) {
      return new WiroTaskSuccess(task);
    }
    if (task.status.kind === 'cancelled') {
      return new WiroTaskFailure(task, WiroTaskFailureReason.cancelled);
    }
    if (task.status.kind === 'completed' && task.exitCode !== 0) {
      return new WiroTaskFailure(task, WiroTaskFailureReason.nonZeroExit);
    }
    return new WiroTaskFailure(task, WiroTaskFailureReason.other);
  },
});
