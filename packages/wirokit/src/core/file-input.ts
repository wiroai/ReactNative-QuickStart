import {
  validateExpoUri,
  validateFileName,
  validateOptionalMediaType,
  validateOptionalSize,
  validateRemoteFileUrl,
} from '../internal/validation';

export class WiroUrlFileInput {
  readonly kind = 'url';
  readonly url: string;
  readonly wireValue: string;

  constructor(url: string | URL) {
    const value = typeof url === 'string' ? url : url.toString();
    this.url = validateRemoteFileUrl(value);
    this.wireValue = this.url;
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroUrlFileInput {
    return other instanceof WiroUrlFileInput && this.url === other.url;
  }

  toString(): string {
    return 'WiroFileInput.Url([REDACTED])';
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      kind: this.kind,
      url: '[REDACTED]',
    });
  }
}

export class WiroBytesFileInput {
  readonly kind = 'bytes';
  readonly fileName: string;
  readonly mediaType: string | undefined;
  readonly wireValue = null;
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array, fileName: string, mediaType?: string) {
    this.#bytes = new Uint8Array(bytes);
    this.fileName = validateFileName(fileName);
    this.mediaType = validateOptionalMediaType(mediaType);
    Object.freeze(this);
  }

  get bytes(): Uint8Array {
    return new Uint8Array(this.#bytes);
  }

  equals(other: unknown): other is WiroBytesFileInput {
    if (
      !(other instanceof WiroBytesFileInput) ||
      this.fileName !== other.fileName ||
      this.mediaType !== other.mediaType ||
      this.#bytes.length !== other.#bytes.length
    ) {
      return false;
    }

    return this.#bytes.every((value, index) => value === other.#bytes[index]);
  }

  toString(): string {
    return `WiroFileInput.Bytes(size=${this.#bytes.length})`;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      fileName: this.fileName,
      kind: this.kind,
      mediaType: this.mediaType,
      size: this.#bytes.length,
    });
  }
}

export class WiroBlobFileInput {
  readonly kind = 'blob';
  readonly fileName: string;
  readonly mediaType: string | undefined;
  readonly wireValue = null;
  readonly #blob: Blob;

  constructor(blob: Blob, fileName: string, mediaType?: string) {
    this.#blob = blob;
    this.fileName = validateFileName(fileName);
    this.mediaType = validateOptionalMediaType(
      mediaType ?? (blob.type || undefined),
    );
    Object.freeze(this);
  }

  get blob(): Blob {
    return this.#blob.slice(0, this.#blob.size, this.#blob.type);
  }

  equals(other: unknown): other is WiroBlobFileInput {
    return (
      other instanceof WiroBlobFileInput &&
      this.#blob === other.#blob &&
      this.fileName === other.fileName &&
      this.mediaType === other.mediaType
    );
  }

  toString(): string {
    return `WiroFileInput.Blob(size=${this.#blob.size})`;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      fileName: this.fileName,
      kind: this.kind,
      mediaType: this.mediaType,
      size: this.#blob.size,
    });
  }
}

export interface WiroUriFileInputOptions {
  readonly fileName?: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
}

export class WiroUriFileInput {
  readonly kind = 'uri';
  readonly uri: string;
  readonly fileName: string | undefined;
  readonly mediaType: string | undefined;
  readonly sizeBytes: number | undefined;
  readonly wireValue = null;

  constructor(uri: string, options: WiroUriFileInputOptions = {}) {
    this.uri = validateExpoUri(uri);
    this.fileName =
      options.fileName === undefined
        ? undefined
        : validateFileName(options.fileName);
    this.mediaType = validateOptionalMediaType(options.mediaType);
    this.sizeBytes = validateOptionalSize(options.sizeBytes);
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroUriFileInput {
    return (
      other instanceof WiroUriFileInput &&
      this.uri === other.uri &&
      this.fileName === other.fileName &&
      this.mediaType === other.mediaType &&
      this.sizeBytes === other.sizeBytes
    );
  }

  toString(): string {
    return 'WiroFileInput.Uri([REDACTED])';
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      fileName: this.fileName,
      kind: this.kind,
      mediaType: this.mediaType,
      sizeBytes: this.sizeBytes,
      uri: '[REDACTED]',
    });
  }
}

export type WiroFileInput =
  WiroUrlFileInput | WiroBytesFileInput | WiroBlobFileInput | WiroUriFileInput;

export const WiroFileInput = Object.freeze({
  blob(blob: Blob, fileName: string, mediaType?: string): WiroBlobFileInput {
    return new WiroBlobFileInput(blob, fileName, mediaType);
  },
  bytes(
    bytes: Uint8Array,
    fileName: string,
    mediaType?: string,
  ): WiroBytesFileInput {
    return new WiroBytesFileInput(bytes, fileName, mediaType);
  },
  uri(uri: string, options?: WiroUriFileInputOptions): WiroUriFileInput {
    return new WiroUriFileInput(uri, options);
  },
  url(url: string | URL): WiroUrlFileInput {
    return new WiroUrlFileInput(url);
  },
});
