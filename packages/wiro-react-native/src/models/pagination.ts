import type { WiroJson, WiroValue } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readBoolean,
  readInteger,
  readObjects,
  readString,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroApiErrorOptions {
  readonly code?: string | undefined;
  readonly message: string;
}

export class WiroApiError {
  readonly code: string | undefined;
  readonly message: string;

  constructor(options: WiroApiErrorOptions) {
    this.code = options.code;
    this.message = options.message;
    Object.freeze(this);
  }

  static parse(json: WiroJson): WiroApiError {
    return new WiroApiError({
      code: readString(json.code),
      message: readString(json.message) ?? 'Unknown Wiro API error',
    });
  }

  static parseList(
    value: WiroValue | undefined,
    onMalformedJson?: MalformedJsonHandler,
  ): readonly WiroApiError[] {
    return immutableArray(
      readObjects(value, onMalformedJson).map(WiroApiError.parse),
    );
  }
}

export interface WiroPaginatedResultOptions<Item> {
  readonly errors?: readonly WiroApiError[];
  readonly isSuccess: boolean;
  readonly items: readonly Item[];
  readonly raw: WiroJson;
  readonly total: number;
}

export class WiroPaginatedResult<Item> {
  readonly errors: readonly WiroApiError[];
  readonly isSuccess: boolean;
  readonly items: readonly Item[];
  readonly raw: WiroJson;
  readonly total: number;

  constructor(options: WiroPaginatedResultOptions<Item>) {
    this.errors = immutableArray(options.errors ?? []);
    this.isSuccess = options.isSuccess;
    this.items = immutableArray(options.items);
    this.raw = immutableJson(options.raw);
    this.total = options.total;
    Object.freeze(this);
  }

  static parse<Item>(
    json: WiroJson,
    itemsKey: string,
    itemFromJson: (json: WiroJson) => Item,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroPaginatedResult<Item> {
    const items = readObjects(json[itemsKey], onMalformedJson).map((item) =>
      itemFromJson(item),
    );
    return new WiroPaginatedResult({
      errors: WiroApiError.parseList(json.errors, onMalformedJson),
      isSuccess: readBoolean(json.result) ?? false,
      items,
      raw: json,
      total: readInteger(json.total) ?? items.length,
    });
  }
}
