import type { WiroJson } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readBoolean,
  readInteger,
  readObjects,
  readString,
  readUrl,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';
import { WiroApiError } from './pagination';

export interface WiroUploadedFileOptions {
  readonly contentType?: string | undefined;
  readonly id: string;
  readonly name?: string | undefined;
  readonly raw: WiroJson;
  readonly size?: number | undefined;
  readonly url?: URL | undefined;
}

export class WiroUploadedFile {
  readonly contentType: string | undefined;
  readonly id: string;
  readonly name: string | undefined;
  readonly raw: WiroJson;
  readonly size: number | undefined;
  readonly #url: string | undefined;

  constructor(options: WiroUploadedFileOptions) {
    this.contentType = options.contentType;
    this.id = options.id;
    this.name = options.name;
    this.raw = immutableJson(options.raw);
    this.size = options.size;
    this.#url = options.url?.toString();
    Object.freeze(this);
  }

  get url(): URL | undefined {
    return this.#url === undefined ? undefined : new URL(this.#url);
  }

  static parse(json: WiroJson): WiroUploadedFile {
    return new WiroUploadedFile({
      contentType: readString(json.contenttype),
      id: readString(json.id) ?? '',
      name: readString(json.name),
      raw: json,
      size: readInteger(json.size),
      url: readUrl(json.url),
    });
  }
}

export interface WiroUploadResultOptions {
  readonly errors?: readonly WiroApiError[];
  readonly files?: readonly WiroUploadedFile[];
  readonly isSuccess: boolean;
  readonly raw: WiroJson;
}

export class WiroUploadResult {
  readonly errors: readonly WiroApiError[];
  readonly files: readonly WiroUploadedFile[];
  readonly isSuccess: boolean;
  readonly raw: WiroJson;

  constructor(options: WiroUploadResultOptions) {
    this.errors = immutableArray(options.errors ?? []);
    this.files = immutableArray(options.files ?? []);
    this.isSuccess = options.isSuccess;
    this.raw = immutableJson(options.raw);
    Object.freeze(this);
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroUploadResult {
    return new WiroUploadResult({
      errors: WiroApiError.parseList(json.errors, onMalformedJson),
      files: readObjects(json.list, onMalformedJson).map(
        WiroUploadedFile.parse,
      ),
      isSuccess: readBoolean(json.result) ?? false,
      raw: json,
    });
  }
}
