import type { WiroJson } from '../core/wiro-value';
import { WiroModelId } from '../core/identifiers';
import {
  type MalformedJsonHandler,
  readDate,
  readInteger,
  readObject,
  readString,
  readStringList,
  readUrl,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroModelTaskStatsOptions {
  readonly errorCount: number;
  readonly lastRunTime?: Date | undefined;
  readonly runCount: number;
  readonly successCount: number;
}

export class WiroModelTaskStats {
  readonly errorCount: number;
  readonly runCount: number;
  readonly successCount: number;
  readonly #lastRunTimeMs: number | undefined;

  constructor(options: WiroModelTaskStatsOptions) {
    this.errorCount = options.errorCount;
    this.runCount = options.runCount;
    this.successCount = options.successCount;
    this.#lastRunTimeMs = options.lastRunTime?.getTime();
    Object.freeze(this);
  }

  get lastRunTime(): Date | undefined {
    return this.#lastRunTimeMs === undefined
      ? undefined
      : new Date(this.#lastRunTimeMs);
  }

  static parse(json: WiroJson): WiroModelTaskStats {
    return new WiroModelTaskStats({
      errorCount: readInteger(json.errorcount) ?? 0,
      lastRunTime: readDate(json.lastruntime),
      runCount: readInteger(json.runcount) ?? 0,
      successCount: readInteger(json.successcount) ?? 0,
    });
  }
}

export interface WiroModelOptions {
  readonly approximateCost?: string | undefined;
  readonly categories?: readonly string[];
  readonly computingTime?: string | undefined;
  readonly cps?: string | undefined;
  readonly description?: string | undefined;
  readonly dynamicPrice?: string | undefined;
  readonly id: string;
  readonly imageUrl?: URL | undefined;
  readonly owner: string;
  readonly raw: WiroJson;
  readonly samples?: readonly string[];
  readonly seoDescription?: string | undefined;
  readonly slug: string;
  readonly tags?: readonly string[];
  readonly taskStats?: WiroModelTaskStats | undefined;
  readonly title?: string | undefined;
}

export class WiroModel {
  readonly approximateCost: string | undefined;
  readonly categories: readonly string[];
  readonly computingTime: string | undefined;
  readonly cps: string | undefined;
  readonly description: string | undefined;
  readonly dynamicPrice: string | undefined;
  readonly id: string;
  readonly owner: string;
  readonly raw: WiroJson;
  readonly samples: readonly string[];
  readonly seoDescription: string | undefined;
  readonly slug: string;
  readonly tags: readonly string[];
  readonly taskStats: WiroModelTaskStats | undefined;
  readonly title: string | undefined;
  readonly #imageUrl: string | undefined;

  constructor(options: WiroModelOptions) {
    this.approximateCost = options.approximateCost;
    this.categories = immutableArray(options.categories ?? []);
    this.computingTime = options.computingTime;
    this.cps = options.cps;
    this.description = options.description;
    this.dynamicPrice = options.dynamicPrice;
    this.id = options.id;
    this.#imageUrl = options.imageUrl?.toString();
    this.owner = options.owner;
    this.raw = immutableJson(options.raw);
    this.samples = immutableArray(options.samples ?? []);
    this.seoDescription = options.seoDescription;
    this.slug = options.slug;
    this.tags = immutableArray(options.tags ?? []);
    this.taskStats = options.taskStats;
    this.title = options.title;
    Object.freeze(this);
  }

  get imageUrl(): URL | undefined {
    return this.#imageUrl === undefined ? undefined : new URL(this.#imageUrl);
  }

  get modelId(): WiroModelId | null {
    return WiroModelId.parse(`${this.owner}/${this.slug}`);
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroModel {
    const taskStats = readObject(json.taskstat, onMalformedJson);
    return new WiroModel({
      approximateCost: readString(json.approximatelycost),
      categories: readStringList(json.categories),
      computingTime: readString(json.computingtime),
      cps: readString(json.cps),
      description: readString(json.description),
      dynamicPrice: readString(json.dynamicprice),
      id: readString(json.id) ?? '',
      imageUrl: readUrl(json.image),
      owner:
        readString(json.cleanslugowner) ?? readString(json.slugowner) ?? '',
      raw: json,
      samples: readStringList(json.samples),
      seoDescription: readString(json.seodescription),
      slug:
        readString(json.cleanslugproject) ?? readString(json.slugproject) ?? '',
      tags: readStringList(json.tags),
      taskStats:
        taskStats === undefined
          ? undefined
          : WiroModelTaskStats.parse(taskStats),
      title: readString(json.title),
    });
  }
}
