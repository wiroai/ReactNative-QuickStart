import { WiroValidationError } from '../errors/wiro-error';

export interface WiroClientLimitsOptions {
  readonly maxInMemoryUploadBytes?: number;
  readonly maxRestBodyBytes?: number;
  readonly maxWebSocketBinaryBytes?: number;
  readonly maxWebSocketTextBytes?: number;
}

export class WiroClientLimits {
  static readonly defaultMaxRestBodyBytes = 16 * 1024 * 1024;
  static readonly defaultMaxWebSocketTextBytes = 8 * 1024 * 1024;
  static readonly defaultMaxWebSocketBinaryBytes = 8 * 1024 * 1024;
  static readonly defaultMaxInMemoryUploadBytes = 16 * 1024 * 1024;

  readonly maxInMemoryUploadBytes: number;
  readonly maxRestBodyBytes: number;
  readonly maxWebSocketBinaryBytes: number;
  readonly maxWebSocketTextBytes: number;

  constructor(options: WiroClientLimitsOptions = {}) {
    this.maxRestBodyBytes = requirePositiveInteger(
      options.maxRestBodyBytes ?? WiroClientLimits.defaultMaxRestBodyBytes,
      'maxRestBodyBytes',
    );
    this.maxWebSocketTextBytes = requirePositiveInteger(
      options.maxWebSocketTextBytes ??
        WiroClientLimits.defaultMaxWebSocketTextBytes,
      'maxWebSocketTextBytes',
    );
    this.maxWebSocketBinaryBytes = requirePositiveInteger(
      options.maxWebSocketBinaryBytes ??
        WiroClientLimits.defaultMaxWebSocketBinaryBytes,
      'maxWebSocketBinaryBytes',
    );
    this.maxInMemoryUploadBytes = requirePositiveInteger(
      options.maxInMemoryUploadBytes ??
        WiroClientLimits.defaultMaxInMemoryUploadBytes,
      'maxInMemoryUploadBytes',
    );
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroClientLimits {
    return (
      other instanceof WiroClientLimits &&
      this.maxRestBodyBytes === other.maxRestBodyBytes &&
      this.maxWebSocketTextBytes === other.maxWebSocketTextBytes &&
      this.maxWebSocketBinaryBytes === other.maxWebSocketBinaryBytes &&
      this.maxInMemoryUploadBytes === other.maxInMemoryUploadBytes
    );
  }

  static get default(): WiroClientLimits {
    return new WiroClientLimits();
  }
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WiroValidationError(`${label} must be greater than zero.`);
  }
  return value;
}
