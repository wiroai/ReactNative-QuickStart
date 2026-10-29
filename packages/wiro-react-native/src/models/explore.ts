import type { WiroJson } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readInteger,
  readObjects,
  readString,
  readUrl,
} from '../internal/json-reader';
import { WiroModel } from './model';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroExploreCategoryOptions {
  readonly id: string;
  readonly models?: readonly WiroModel[];
  readonly raw: WiroJson;
  readonly title: string;
  readonly total: number;
  readonly url?: URL | undefined;
}

export class WiroExploreCategory {
  readonly id: string;
  readonly models: readonly WiroModel[];
  readonly raw: WiroJson;
  readonly title: string;
  readonly total: number;
  readonly #url: string | undefined;

  constructor(options: WiroExploreCategoryOptions) {
    this.id = options.id;
    this.models = immutableArray(options.models ?? []);
    this.raw = immutableJson(options.raw);
    this.title = options.title;
    this.total = options.total;
    this.#url = options.url?.toString();
    Object.freeze(this);
  }

  get url(): URL | undefined {
    return this.#url === undefined ? undefined : new URL(this.#url);
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroExploreCategory {
    const models = readObjects(json.tools, onMalformedJson).map((item) =>
      WiroModel.parse(item, onMalformedJson),
    );
    return new WiroExploreCategory({
      id: readString(json.id) ?? '',
      models,
      raw: json,
      title: readString(json.title) ?? readString(json.name) ?? '',
      total: readInteger(json.total) ?? models.length,
      url: readUrl(json.url),
    });
  }
}
