import type { WiroJson } from '../core/wiro-value';
import {
  readBoolean,
  readDouble,
  readInteger,
  readString,
  readStringList,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroTaskProgressOptions {
  readonly answers?: readonly string[];
  readonly currentStep?: number | undefined;
  readonly elapsedTime?: string | undefined;
  readonly isThinking?: boolean | undefined;
  readonly percentage?: number | undefined;
  readonly raw: WiroJson;
  readonly rawText?: string | undefined;
  readonly remainingTime?: string | undefined;
  readonly speed?: string | undefined;
  readonly speedType?: string | undefined;
  readonly task?: string | undefined;
  readonly thinking?: readonly string[];
  readonly totalSteps?: number | undefined;
  readonly type?: string | undefined;
}

export class WiroTaskProgress {
  readonly answers: readonly string[];
  readonly currentStep: number | undefined;
  readonly elapsedTime: string | undefined;
  readonly isThinking: boolean | undefined;
  readonly percentage: number | undefined;
  readonly raw: WiroJson;
  readonly rawText: string | undefined;
  readonly remainingTime: string | undefined;
  readonly speed: string | undefined;
  readonly speedType: string | undefined;
  readonly task: string | undefined;
  readonly thinking: readonly string[];
  readonly totalSteps: number | undefined;
  readonly type: string | undefined;

  constructor(options: WiroTaskProgressOptions) {
    this.answers = immutableArray(options.answers ?? []);
    this.currentStep = options.currentStep;
    this.elapsedTime = options.elapsedTime;
    this.isThinking = options.isThinking;
    this.percentage = options.percentage;
    this.raw = immutableJson(options.raw);
    this.rawText = options.rawText;
    this.remainingTime = options.remainingTime;
    this.speed = options.speed;
    this.speedType = options.speedType;
    this.task = options.task;
    this.thinking = immutableArray(options.thinking ?? []);
    this.totalSteps = options.totalSteps;
    this.type = options.type;
    Object.freeze(this);
  }

  static parse(json: WiroJson): WiroTaskProgress {
    return new WiroTaskProgress({
      answers: readStringList(json.answer),
      currentStep: readInteger(json.stepCurrent),
      elapsedTime: readString(json.elapsedTime),
      isThinking: readBoolean(json.isThinking),
      percentage: readDouble(json.percentage),
      raw: json,
      rawText: readString(json.raw),
      remainingTime: readString(json.remainingTime),
      speed: readString(json.speed),
      speedType: readString(json.speedType),
      task: readString(json.task),
      thinking: readStringList(json.thinking),
      totalSteps: readInteger(json.stepTotal),
      type: readString(json.type),
    });
  }
}
