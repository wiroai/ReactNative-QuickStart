import { WiroTaskId, WiroTaskToken } from '../core/identifiers';
import type { WiroJson } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readDate,
  readDouble,
  readInteger,
  readObject,
  readObjects,
  readString,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';
import { WiroTaskOutput } from './task-output';
import { WiroTaskStatus } from './task-status';

export interface WiroTaskOptions {
  readonly debugOutput?: string | undefined;
  readonly elapsed?: number | undefined;
  readonly endTime?: Date | undefined;
  readonly exitCode?: number | undefined;
  readonly id?: WiroTaskId | undefined;
  readonly modelDescription?: string | undefined;
  readonly modelOwner?: string | undefined;
  readonly modelSlug?: string | undefined;
  readonly outputs?: readonly WiroTaskOutput[];
  readonly parameters?: WiroJson | undefined;
  readonly raw: WiroJson;
  readonly startTime?: Date | undefined;
  readonly status: WiroTaskStatus;
  readonly statusRawValue: string;
  readonly taskToken?: WiroTaskToken | undefined;
  readonly totalCost?: number | undefined;
}

export class WiroTask {
  readonly debugOutput: string | undefined;
  readonly elapsed: number | undefined;
  readonly exitCode: number | undefined;
  readonly id: WiroTaskId | undefined;
  readonly modelDescription: string | undefined;
  readonly modelOwner: string | undefined;
  readonly modelSlug: string | undefined;
  readonly outputs: readonly WiroTaskOutput[];
  readonly parameters: WiroJson;
  readonly raw: WiroJson;
  readonly status: WiroTaskStatus;
  readonly statusRawValue: string;
  readonly taskToken: WiroTaskToken | undefined;
  readonly totalCost: number | undefined;
  readonly #endTimeMs: number | undefined;
  readonly #startTimeMs: number | undefined;

  constructor(options: WiroTaskOptions) {
    this.debugOutput = options.debugOutput;
    this.elapsed = options.elapsed;
    this.#endTimeMs = options.endTime?.getTime();
    this.exitCode = options.exitCode;
    this.id = options.id;
    this.modelDescription = options.modelDescription;
    this.modelOwner = options.modelOwner;
    this.modelSlug = options.modelSlug;
    this.outputs = immutableArray(options.outputs ?? []);
    this.parameters = immutableJson(options.parameters ?? {});
    this.raw = immutableJson(options.raw);
    this.#startTimeMs = options.startTime?.getTime();
    this.status = options.status;
    this.statusRawValue = options.statusRawValue;
    this.taskToken = options.taskToken;
    this.totalCost = options.totalCost;
    Object.freeze(this);
  }

  get startTime(): Date | undefined {
    return this.#startTimeMs === undefined
      ? undefined
      : new Date(this.#startTimeMs);
  }

  get endTime(): Date | undefined {
    return this.#endTimeMs === undefined
      ? undefined
      : new Date(this.#endTimeMs);
  }

  get isFinished(): boolean {
    return this.status.isTerminal;
  }

  get isSuccessful(): boolean {
    return this.status.kind === 'completed' && this.exitCode === 0;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      debugOutput: this.debugOutput,
      elapsed: this.elapsed,
      endTime: this.endTime?.toISOString(),
      exitCode: this.exitCode,
      id: this.id,
      modelDescription: this.modelDescription,
      modelOwner: this.modelOwner,
      modelSlug: this.modelSlug,
      outputs: this.outputs,
      parameters: this.parameters,
      startTime: this.startTime?.toISOString(),
      status: this.status.apiValue,
      statusRawValue: this.statusRawValue,
      taskToken: this.taskToken === undefined ? undefined : '[REDACTED]',
      totalCost: this.totalCost,
    });
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroTask {
    const statusRawValue = readString(json.status) ?? '';
    const id = readString(json.id) ?? readString(json.taskid);
    const parameters = readObject(json.parameters, onMalformedJson);
    const outputValue = json.outputs ?? json.output;

    return new WiroTask({
      debugOutput: readString(json.debugoutput),
      elapsed: durationMsFromSeconds(json.elapsedseconds),
      endTime: readDate(json.endtime),
      exitCode: readInteger(json.pexit),
      id: id === undefined ? undefined : (WiroTaskId.parse(id) ?? undefined),
      modelDescription: readString(json.modeldescription),
      modelOwner: readString(json.modelslugowner),
      modelSlug: readString(json.modelslugproject),
      outputs: readObjects(outputValue, onMalformedJson).map((output) =>
        WiroTaskOutput.parse(output, onMalformedJson),
      ),
      parameters,
      raw: json,
      startTime: readDate(json.starttime),
      status: WiroTaskStatus.parse(statusRawValue),
      statusRawValue,
      taskToken:
        WiroTaskToken.parse(readString(json.socketaccesstoken) ?? '') ??
        undefined,
      totalCost: readDouble(json.totalcost),
    });
  }
}

function durationMsFromSeconds(
  value: WiroJson[string] | undefined,
): number | undefined {
  const seconds = readDouble(value);
  return seconds === undefined ? undefined : Math.round(seconds * 1_000);
}
