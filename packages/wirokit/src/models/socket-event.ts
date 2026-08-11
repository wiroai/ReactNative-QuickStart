import {
  WiroObjectValue,
  WiroStringValue,
  type WiroJson,
  type WiroValue,
  parseWiroValue,
} from '../core/wiro-value';
import { WiroTaskId, WiroTaskToken } from '../core/identifiers';
import { WiroWebSocketError } from '../errors/wiro-error';
import {
  readBoolean,
  readObject,
  readObjects,
  readString,
} from '../internal/json-reader';
import { utf8ByteLength } from '../internal/utf8';
import type { WiroSocketFrame } from '../transport/socket-session';
import { immutableArray, immutableJson } from './model-utils';
import { WiroTaskOutput } from './task-output';
import { WiroTaskProgress } from './task-progress';
import { WiroTaskStatus } from './task-status';

const PROGRESS_KEYS = new Set([
  'answer',
  'elapsedTime',
  'isThinking',
  'percentage',
  'raw',
  'remainingTime',
  'speed',
  'speedType',
  'stepCurrent',
  'stepTotal',
  'task',
  'thinking',
  'type',
]);

export class WiroSocketLogPayload {
  readonly kind = 'log';

  constructor(readonly text: string) {
    Object.freeze(this);
  }
}

export class WiroSocketProgressPayload {
  readonly kind = 'progress';

  constructor(readonly progress: WiroTaskProgress) {
    Object.freeze(this);
  }
}

export class WiroSocketOutputsPayload {
  readonly kind = 'outputs';
  readonly outputs: readonly WiroTaskOutput[];

  constructor(outputs: readonly WiroTaskOutput[]) {
    this.outputs = immutableArray(outputs);
    Object.freeze(this);
  }
}

export class WiroSocketUnknownPayload {
  readonly kind = 'unknown';

  constructor(readonly value: WiroValue | undefined) {
    Object.freeze(this);
  }
}

export type WiroSocketPayload =
  | WiroSocketLogPayload
  | WiroSocketProgressPayload
  | WiroSocketOutputsPayload
  | WiroSocketUnknownPayload;

export interface WiroSocketMessageOptions {
  readonly id?: WiroTaskId | undefined;
  readonly payload: WiroSocketPayload;
  readonly raw: WiroJson;
  readonly result: boolean;
  readonly status: WiroTaskStatus;
  readonly statusRawValue: string;
  readonly taskToken?: WiroTaskToken | undefined;
}

export class WiroSocketMessage {
  readonly id: WiroTaskId | undefined;
  readonly payload: WiroSocketPayload;
  readonly raw: WiroJson;
  readonly result: boolean;
  readonly status: WiroTaskStatus;
  readonly statusRawValue: string;
  readonly taskToken: WiroTaskToken | undefined;

  constructor(options: WiroSocketMessageOptions) {
    this.id = options.id;
    this.payload = options.payload;
    this.raw = immutableJson(options.raw);
    this.result = options.result;
    this.status = options.status;
    this.statusRawValue = options.statusRawValue;
    this.taskToken = options.taskToken;
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return this.status.isTerminal;
  }

  get messageText(): string | undefined {
    return this.payload instanceof WiroSocketLogPayload
      ? this.payload.text
      : undefined;
  }

  get outputs(): readonly WiroTaskOutput[] {
    return this.payload instanceof WiroSocketOutputsPayload
      ? this.payload.outputs
      : [];
  }

  get progress(): WiroTaskProgress | undefined {
    return this.payload instanceof WiroSocketProgressPayload
      ? this.payload.progress
      : undefined;
  }

  static parse(json: WiroJson): WiroSocketMessage {
    const statusRawValue = readString(json.type) ?? '';
    return new WiroSocketMessage({
      id: WiroTaskId.parse(readString(json.id) ?? '') ?? undefined,
      payload: parsePayload(statusRawValue, json.message),
      raw: json,
      result: readBoolean(json.result) ?? false,
      status: WiroTaskStatus.parse(statusRawValue),
      statusRawValue,
      taskToken:
        WiroTaskToken.parse(readString(json.tasktoken) ?? '') ?? undefined,
    });
  }
}

export class WiroSocketMessageEvent {
  readonly kind = 'message';

  constructor(readonly message: WiroSocketMessage) {
    Object.freeze(this);
  }

  get isTerminal(): boolean {
    return this.message.isTerminal;
  }
}

export class WiroSocketBinaryEvent {
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
}

export type WiroSocketEvent = WiroSocketMessageEvent | WiroSocketBinaryEvent;

export const WiroSocketEvent = Object.freeze({
  binary(bytes: Uint8Array): WiroSocketBinaryEvent {
    return new WiroSocketBinaryEvent(bytes);
  },
  message(message: WiroSocketMessage): WiroSocketMessageEvent {
    return new WiroSocketMessageEvent(message);
  },
});

export interface WiroSocketFrameLimits {
  readonly maxBinaryBytes: number;
  readonly maxTextBytes: number;
}

export function decodeSocketFrame(
  frame: WiroSocketFrame,
  limits: WiroSocketFrameLimits,
): WiroSocketEvent {
  if (frame.kind === 'binary') {
    if (frame.bytes.byteLength > limits.maxBinaryBytes) {
      throw new WiroWebSocketError(
        'The Wiro task WebSocket returned a binary frame ' +
          'that exceeds the size limit.',
      );
    }
    return WiroSocketEvent.binary(frame.bytes);
  }
  if (utf8ByteLength(frame.text) > limits.maxTextBytes) {
    throw new WiroWebSocketError(
      'The Wiro task WebSocket returned a text frame ' +
        'that exceeds the size limit.',
    );
  }

  let parsed: WiroValue;
  try {
    parsed = parseWiroValue(frame.text);
  } catch {
    throw new WiroWebSocketError(
      'The Wiro task WebSocket returned invalid JSON.',
    );
  }
  if (!(parsed instanceof WiroObjectValue)) {
    throw new WiroWebSocketError(
      'The Wiro task WebSocket returned a non-object JSON payload.',
    );
  }
  return WiroSocketEvent.message(WiroSocketMessage.parse(parsed.value));
}

function parsePayload(
  statusRawValue: string,
  value: WiroValue | undefined,
): WiroSocketPayload {
  if (statusRawValue === WiroTaskStatus.completed.apiValue) {
    return new WiroSocketOutputsPayload(
      readObjects(value).map((item) => WiroTaskOutput.parse(item)),
    );
  }
  if (value instanceof WiroStringValue) {
    const nested = value.value.trimStart().startsWith('{')
      ? readObject(value)
      : undefined;
    return nested !== undefined && hasProgressKey(nested)
      ? new WiroSocketProgressPayload(WiroTaskProgress.parse(nested))
      : new WiroSocketLogPayload(value.value);
  }
  if (value instanceof WiroObjectValue && hasProgressKey(value.value)) {
    return new WiroSocketProgressPayload(WiroTaskProgress.parse(value.value));
  }
  return new WiroSocketUnknownPayload(value);
}

function hasProgressKey(json: WiroJson): boolean {
  return Object.keys(json).some((key) => PROGRESS_KEYS.has(key));
}
