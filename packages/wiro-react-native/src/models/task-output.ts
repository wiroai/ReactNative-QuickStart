import type { WiroJson } from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readInteger,
  readObject,
  readString,
  readStringList,
  readUrl,
} from '../internal/json-reader';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroTaskOutputContentOptions {
  readonly answers?: readonly string[];
  readonly prompt?: string | undefined;
  readonly rawText?: string | undefined;
  readonly thinking?: readonly string[];
}

export class WiroTaskOutputContent {
  readonly answers: readonly string[];
  readonly prompt: string | undefined;
  readonly rawText: string | undefined;
  readonly thinking: readonly string[];

  constructor(options: WiroTaskOutputContentOptions = {}) {
    this.answers = immutableArray(options.answers ?? []);
    this.prompt = options.prompt;
    this.rawText = options.rawText;
    this.thinking = immutableArray(options.thinking ?? []);
    Object.freeze(this);
  }

  static parse(json: WiroJson): WiroTaskOutputContent {
    return new WiroTaskOutputContent({
      answers: readStringList(json.answer),
      prompt: readString(json.prompt),
      rawText: readString(json.raw),
      thinking: readStringList(json.thinking),
    });
  }
}

export interface WiroTaskOutputOptions {
  readonly content?: WiroTaskOutputContent | undefined;
  readonly contentType: string;
  readonly name?: string | undefined;
  readonly raw: WiroJson;
  readonly size?: number | undefined;
  readonly url?: URL | undefined;
}

export class WiroTaskOutput {
  readonly content: WiroTaskOutputContent | undefined;
  readonly contentType: string;
  readonly name: string | undefined;
  readonly raw: WiroJson;
  readonly size: number | undefined;
  readonly #url: string | undefined;

  constructor(options: WiroTaskOutputOptions) {
    this.content = options.content;
    this.contentType = options.contentType;
    this.name = options.name;
    this.raw = immutableJson(options.raw);
    this.size = options.size;
    this.#url = options.url?.toString();
    Object.freeze(this);
  }

  get url(): URL | undefined {
    return this.#url === undefined ? undefined : new URL(this.#url);
  }

  get isImage(): boolean {
    return this.contentType.toLowerCase().startsWith('image/');
  }

  get isVideo(): boolean {
    return this.contentType.toLowerCase().startsWith('video/');
  }

  get isAudio(): boolean {
    return this.contentType.toLowerCase().startsWith('audio/');
  }

  get isText(): boolean {
    const normalized = this.contentType.toLowerCase();
    return (
      normalized.startsWith('text/') ||
      normalized === 'raw' ||
      normalized === 'application/json'
    );
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroTaskOutput {
    const content = readObject(json.content, onMalformedJson);
    return new WiroTaskOutput({
      content:
        content !== undefined && Object.keys(content).length > 0
          ? WiroTaskOutputContent.parse(content)
          : undefined,
      contentType: readString(json.contenttype) ?? '',
      name: readString(json.name),
      raw: json,
      size: readInteger(json.size),
      url: readUrl(json.url),
    });
  }
}
