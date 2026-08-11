import { WiroValidationError } from '../errors/wiro-error';
import { encodeUtf8 } from './utf8';

const BOUNDARY_PATTERN = /^[A-Za-z0-9-]+$/;

export interface WiroMultipartFilePartOptions {
  readonly boundary?: string;
  readonly bytes: Uint8Array;
  readonly fileName: string;
}

export class WiroMultipartBody {
  readonly boundary: string;
  readonly contentType: string;
  readonly #body: Uint8Array;

  constructor(boundary: string, contentType: string, body: Uint8Array) {
    this.boundary = boundary;
    this.contentType = contentType;
    this.#body = new Uint8Array(body);
    Object.freeze(this);
  }

  get body(): Uint8Array {
    return new Uint8Array(this.#body);
  }
}

export function buildMultipartFilePart(
  options: WiroMultipartFilePartOptions,
): WiroMultipartBody {
  const boundary = options.boundary ?? generateBoundary();
  if (!BOUNDARY_PATTERN.test(boundary)) {
    throw new WiroValidationError('Invalid multipart boundary.');
  }
  const escapedName = escapeMultipartFileName(options.fileName);
  const prefix = encodeUtf8(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; ' +
      `filename="${escapedName}"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n',
  );
  const suffix = encodeUtf8(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(
    prefix.byteLength + options.bytes.byteLength + suffix.byteLength,
  );
  body.set(prefix, 0);
  body.set(options.bytes, prefix.byteLength);
  body.set(suffix, prefix.byteLength + options.bytes.byteLength);
  return new WiroMultipartBody(
    boundary,
    `multipart/form-data; boundary=${boundary}`,
    body,
  );
}

export function escapeMultipartFileName(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function generateBoundary(): string {
  let value = 'Boundary-';
  for (let index = 0; index < 32; index += 1) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value;
}
