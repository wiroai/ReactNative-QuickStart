import {
  WiroBlobFileInput,
  WiroBytesFileInput,
  type WiroUriFileInput,
} from '../core/file-input';
import { WiroValidationError } from '../errors/wiro-error';
import { createAbortError, isAbortError } from '../internal/runtime';

export type WiroReadableFileInput =
  WiroBytesFileInput | WiroBlobFileInput | WiroUriFileInput;

export interface WiroFileContentSourceReadOptions {
  readonly signal?: AbortSignal;
}

export class WiroBytesFileContent {
  readonly kind = 'bytes';
  readonly fileName: string;
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array, fileName: string) {
    this.#bytes = new Uint8Array(bytes);
    this.fileName = fileName;
    Object.freeze(this);
  }

  get bytes(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }
}

export class WiroExpoUriFileContent {
  readonly kind = 'expoUri';
  readonly fileName: string;
  readonly uri: string;

  constructor(uri: string, fileName: string) {
    this.fileName = fileName;
    this.uri = uri;
    Object.freeze(this);
  }
}

export type WiroFileContent = WiroBytesFileContent | WiroExpoUriFileContent;

export interface WiroFileContentSource {
  read(
    input: WiroReadableFileInput,
    options?: WiroFileContentSourceReadOptions,
  ): Promise<WiroFileContent>;
}

export class ExpoWiroFileContentSource implements WiroFileContentSource {
  constructor() {
    Object.freeze(this);
  }

  async read(
    input: WiroReadableFileInput,
    options: WiroFileContentSourceReadOptions = {},
  ): Promise<WiroFileContent> {
    throwIfAborted(options.signal);
    if (input instanceof WiroBytesFileInput) {
      return new WiroBytesFileContent(input.bytes, input.fileName);
    }
    if (input instanceof WiroBlobFileInput) {
      try {
        const bytes = new Uint8Array(await input.blob.arrayBuffer());
        throwIfAborted(options.signal);
        return new WiroBytesFileContent(bytes, input.fileName);
      } catch (error) {
        rethrowAbort(error, options.signal);
        throw new WiroValidationError('The Blob content could not be read.');
      }
    }

    return new WiroExpoUriFileContent(
      input.uri,
      input.fileName ?? 'upload.bin',
    );
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}

function rethrowAbort(error: unknown, signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
  if (isAbortError(error)) {
    throw error;
  }
}
