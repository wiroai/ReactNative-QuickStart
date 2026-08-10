import { WiroValidationError } from '../errors/wiro-error';

const MODEL_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function validateModelSegment(
  value: string,
  label: 'owner' | 'project',
): string {
  if (!MODEL_SEGMENT_PATTERN.test(value)) {
    throw new WiroValidationError(
      `Invalid model ${label} '${value}'. Expected a slug ` +
        'matching ^[A-Za-z0-9][A-Za-z0-9._-]*$.',
    );
  }
  return value;
}

function validateNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new WiroValidationError(`${label} must be non-empty.`);
  }
  return trimmed;
}

export class WiroModelId {
  readonly owner: string;
  readonly project: string;

  constructor(owner: string, project: string) {
    this.owner = validateModelSegment(owner, 'owner');
    this.project = validateModelSegment(project, 'project');
    Object.freeze(this);
  }

  get slug(): string {
    return `${this.owner}/${this.project}`;
  }

  equals(other: unknown): other is WiroModelId {
    return (
      other instanceof WiroModelId &&
      this.owner === other.owner &&
      this.project === other.project
    );
  }

  toJSON(): string {
    return this.slug;
  }

  toString(): string {
    return this.slug;
  }

  static parse(value: string): WiroModelId | null {
    const parts = value.trim().split('/');
    if (
      parts.length !== 2 ||
      parts[0] === undefined ||
      parts[1] === undefined ||
      !MODEL_SEGMENT_PATTERN.test(parts[0]) ||
      !MODEL_SEGMENT_PATTERN.test(parts[1])
    ) {
      return null;
    }
    return new WiroModelId(parts[0], parts[1]);
  }
}

export class WiroTaskId {
  readonly rawValue: string;

  constructor(rawValue: string) {
    this.rawValue = validateNonEmpty(rawValue, 'task id');
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroTaskId {
    return other instanceof WiroTaskId && this.rawValue === other.rawValue;
  }

  toJSON(): string {
    return this.rawValue;
  }

  toString(): string {
    return this.rawValue;
  }

  static parse(value: string): WiroTaskId | null {
    try {
      return new WiroTaskId(value);
    } catch {
      return null;
    }
  }
}

export class WiroTaskToken {
  readonly rawValue: string;

  constructor(rawValue: string) {
    this.rawValue = validateNonEmpty(rawValue, 'task token');
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroTaskToken {
    return other instanceof WiroTaskToken && this.rawValue === other.rawValue;
  }

  toJSON(): string {
    return this.rawValue;
  }

  toString(): string {
    return 'WiroTaskToken([REDACTED])';
  }

  static parse(value: string): WiroTaskToken | null {
    try {
      return new WiroTaskToken(value);
    } catch {
      return null;
    }
  }
}
