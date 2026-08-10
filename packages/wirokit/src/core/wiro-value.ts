import { WiroValidationError } from '../errors/wiro-error';
import type { WiroFileInput } from './file-input';

const NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

const MAX_JSON_DEPTH = 128;

export type WiroJson = Readonly<Record<string, WiroValue>>;

export class WiroStringValue {
  readonly kind = 'string';

  constructor(readonly value: string) {
    Object.freeze(this);
  }

  get stringValue(): string {
    return this.value;
  }

  get intValue(): number | null {
    return exactInteger(this.value.trim());
  }

  get doubleValue(): number | null {
    return finiteNumber(this.value.trim());
  }

  equals(other: unknown): other is WiroStringValue {
    return other instanceof WiroStringValue && this.value === other.value;
  }
}

export class WiroNumberValue {
  readonly kind = 'number';

  constructor(readonly rawValue: string) {
    if (!NUMBER_PATTERN.test(rawValue) || !hasSupportedDecimalScale(rawValue)) {
      throw new WiroValidationError('Invalid JSON number lexeme.');
    }
    Object.freeze(this);
  }

  get intValue(): number | null {
    return exactInteger(this.rawValue);
  }

  get doubleValue(): number | null {
    return finiteNumber(this.rawValue);
  }

  equals(other: unknown): other is WiroNumberValue {
    return other instanceof WiroNumberValue && this.rawValue === other.rawValue;
  }

  toString(): string {
    return this.rawValue;
  }
}

export class WiroBooleanValue {
  readonly kind = 'boolean';

  constructor(readonly value: boolean) {
    Object.freeze(this);
  }

  get booleanValue(): boolean {
    return this.value;
  }

  equals(other: unknown): other is WiroBooleanValue {
    return other instanceof WiroBooleanValue && this.value === other.value;
  }
}

export class WiroObjectValue {
  readonly kind = 'object';
  readonly value: WiroJson;

  constructor(value: Readonly<Record<string, WiroValue>>) {
    const copied = Object.create(null) as Record<string, WiroValue>;
    for (const [key, nested] of Object.entries(value)) {
      Object.defineProperty(copied, key, {
        configurable: false,
        enumerable: true,
        value: nested,
        writable: false,
      });
    }
    this.value = Object.freeze(copied);
    Object.freeze(this);
  }

  get objectValue(): WiroJson {
    return this.value;
  }

  equals(other: unknown): other is WiroObjectValue {
    if (!(other instanceof WiroObjectValue)) {
      return false;
    }
    const entries = Object.entries(this.value);
    const otherEntries = Object.entries(other.value);
    return (
      entries.length === otherEntries.length &&
      entries.every(([key, nested]) => {
        const otherNested = other.value[key];
        return (
          otherNested !== undefined && wiroValueEquals(nested, otherNested)
        );
      })
    );
  }
}

export class WiroArrayValue {
  readonly kind = 'array';
  readonly value: readonly WiroValue[];

  constructor(value: readonly WiroValue[]) {
    this.value = Object.freeze([...value]);
    Object.freeze(this);
  }

  get arrayValue(): readonly WiroValue[] {
    return this.value;
  }

  equals(other: unknown): other is WiroArrayValue {
    return (
      other instanceof WiroArrayValue &&
      this.value.length === other.value.length &&
      this.value.every((nested, index) => {
        const otherNested = other.value[index];
        return (
          otherNested !== undefined && wiroValueEquals(nested, otherNested)
        );
      })
    );
  }
}

export class WiroNullValue {
  readonly kind = 'null';
  readonly isNull = true;

  private constructor() {
    Object.freeze(this);
  }

  equals(other: unknown): other is WiroNullValue {
    return other instanceof WiroNullValue;
  }

  static readonly instance = new WiroNullValue();
}

export class WiroFileInputValue {
  readonly kind = 'fileInput';

  constructor(readonly value: WiroFileInput) {
    Object.freeze(this);
  }

  get fileInputValue(): WiroFileInput {
    return this.value;
  }

  equals(other: unknown): other is WiroFileInputValue {
    return (
      other instanceof WiroFileInputValue && this.value.equals(other.value)
    );
  }

  toString(): string {
    return 'WiroValue.FileInputValue([REDACTED])';
  }
}

export type WiroValue =
  | WiroStringValue
  | WiroNumberValue
  | WiroBooleanValue
  | WiroObjectValue
  | WiroArrayValue
  | WiroNullValue
  | WiroFileInputValue;

export const WiroValue = Object.freeze({
  array(value: readonly WiroValue[]): WiroArrayValue {
    return new WiroArrayValue(value);
  },
  boolean(value: boolean): WiroBooleanValue {
    return new WiroBooleanValue(value);
  },
  fileInput(value: WiroFileInput): WiroFileInputValue {
    return new WiroFileInputValue(value);
  },
  fromUnknown(value: unknown): WiroValue {
    return valueFromUnknown(value, new WeakSet(), 0);
  },
  null: WiroNullValue.instance,
  number(value: number): WiroNumberValue {
    if (!Number.isFinite(value)) {
      throw new WiroValidationError('Invalid JSON number lexeme.');
    }
    return new WiroNumberValue(String(value));
  },
  numberLexeme(rawValue: string): WiroNumberValue {
    return new WiroNumberValue(rawValue);
  },
  object(value: Readonly<Record<string, WiroValue>>): WiroObjectValue {
    return new WiroObjectValue(value);
  },
  string(value: string): WiroStringValue {
    return new WiroStringValue(value);
  },
});

export function parseWiroValue(json: string): WiroValue {
  return new WiroJsonParser(json).parse();
}

export function parseWiroJson(json: string): WiroJson {
  const value = parseWiroValue(json);
  if (!(value instanceof WiroObjectValue)) {
    throw new WiroValidationError('Expected a JSON object.');
  }
  return value.value;
}

export function stringifyWiroValue(value: WiroValue): string {
  switch (value.kind) {
    case 'string':
      return JSON.stringify(value.value);
    case 'number':
      return value.rawValue;
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return 'null';
    case 'array':
      return `[${value.value.map(stringifyWiroValue).join(',')}]`;
    case 'object':
      return stringifyObject(value.value);
    case 'fileInput':
      throw new WiroValidationError(
        'Cannot serialize an unresolved WiroFileInput; ' +
          'resolve file inputs before encoding.',
      );
  }
}

export function stringifyWiroJson(value: WiroJson): string {
  return stringifyObject(value);
}

export function wiroValueEquals(left: WiroValue, right: WiroValue): boolean {
  return left.equals(right);
}

function stringifyObject(value: WiroJson): string {
  const entries = Object.entries(value).map(
    ([key, nested]) => `${JSON.stringify(key)}:${stringifyWiroValue(nested)}`,
  );
  return `{${entries.join(',')}}`;
}

function finiteNumber(value: string): number | null {
  if (value.length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactInteger(value: string): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function hasSupportedDecimalScale(value: string): boolean {
  const exponentIndex = value.search(/[eE]/u);
  const coefficient = exponentIndex < 0 ? value : value.slice(0, exponentIndex);
  const exponent =
    exponentIndex < 0 ? 0n : BigInt(value.slice(exponentIndex + 1));
  const decimalIndex = coefficient.indexOf('.');
  const fractionalDigits =
    decimalIndex < 0 ? 0n : BigInt(coefficient.length - decimalIndex - 1);
  const scale = fractionalDigits - exponent;
  return scale >= -2_147_483_648n && scale <= 2_147_483_647n;
}

function valueFromUnknown(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): WiroValue {
  if (depth > MAX_JSON_DEPTH) {
    throw new WiroValidationError(
      'JSON value exceeds the maximum nesting depth.',
    );
  }
  if (value === null) {
    return WiroNullValue.instance;
  }
  if (typeof value === 'string') {
    return new WiroStringValue(value);
  }
  if (typeof value === 'number') {
    return WiroValue.number(value);
  }
  if (typeof value === 'bigint') {
    return new WiroNumberValue(value.toString());
  }
  if (typeof value === 'boolean') {
    return new WiroBooleanValue(value);
  }
  if (typeof value !== 'object') {
    throw new WiroValidationError('Unsupported JSON value.');
  }
  if (seen.has(value)) {
    throw new WiroValidationError('JSON value must not contain cycles.');
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return new WiroArrayValue(
        value.map((nested) => valueFromUnknown(nested, seen, depth + 1)),
      );
    }

    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new WiroValidationError('Unsupported JSON object.');
    }

    const result = Object.create(null) as Record<string, WiroValue>;
    for (const [key, nested] of Object.entries(value)) {
      result[key] = valueFromUnknown(nested, seen, depth + 1);
    }
    return new WiroObjectValue(result);
  } finally {
    seen.delete(value);
  }
}

class WiroJsonParser {
  readonly #source: string;
  #index = 0;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): WiroValue {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.#index !== this.#source.length) {
      this.fail();
    }
    return value;
  }

  private parseValue(depth: number): WiroValue {
    if (depth > MAX_JSON_DEPTH) {
      throw new WiroValidationError(
        'JSON value exceeds the maximum nesting depth.',
      );
    }
    const character = this.#source[this.#index];
    switch (character) {
      case '"':
        return new WiroStringValue(this.parseString());
      case '{':
        return this.parseObject(depth + 1);
      case '[':
        return this.parseArray(depth + 1);
      case 't':
        this.consumeLiteral('true');
        return new WiroBooleanValue(true);
      case 'f':
        this.consumeLiteral('false');
        return new WiroBooleanValue(false);
      case 'n':
        this.consumeLiteral('null');
        return WiroNullValue.instance;
      default:
        return this.parseNumber();
    }
  }

  private parseObject(depth: number): WiroObjectValue {
    this.#index += 1;
    this.skipWhitespace();
    const result = Object.create(null) as Record<string, WiroValue>;
    if (this.consumeIf('}')) {
      return new WiroObjectValue(result);
    }

    while (true) {
      if (this.#source[this.#index] !== '"') {
        this.fail();
      }
      const key = this.parseString();
      this.skipWhitespace();
      this.consume(':');
      this.skipWhitespace();
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      if (this.consumeIf('}')) {
        return new WiroObjectValue(result);
      }
      this.consume(',');
      this.skipWhitespace();
    }
  }

  private parseArray(depth: number): WiroArrayValue {
    this.#index += 1;
    this.skipWhitespace();
    const result: WiroValue[] = [];
    if (this.consumeIf(']')) {
      return new WiroArrayValue(result);
    }

    while (true) {
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      if (this.consumeIf(']')) {
        return new WiroArrayValue(result);
      }
      this.consume(',');
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    const start = this.#index;
    this.#index += 1;
    let escaped = false;

    while (this.#index < this.#source.length) {
      const character = this.#source[this.#index];
      this.#index += 1;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        const token = this.#source.slice(start, this.#index);
        try {
          return JSON.parse(token) as string;
        } catch {
          this.fail();
        }
      }
    }
    this.fail();
  }

  private parseNumber(): WiroNumberValue {
    const remaining = this.#source.slice(this.#index);
    const match = remaining.match(
      /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/,
    );
    if (match?.[0] === undefined) {
      this.fail();
    }
    this.#index += match[0].length;
    return new WiroNumberValue(match[0]);
  }

  private consumeLiteral(literal: string): void {
    if (!this.#source.startsWith(literal, this.#index)) {
      this.fail();
    }
    this.#index += literal.length;
  }

  private consume(expected: string): void {
    if (!this.consumeIf(expected)) {
      this.fail();
    }
  }

  private consumeIf(expected: string): boolean {
    if (this.#source[this.#index] !== expected) {
      return false;
    }
    this.#index += 1;
    return true;
  }

  private skipWhitespace(): void {
    while (
      this.#source[this.#index] === ' ' ||
      this.#source[this.#index] === '\n' ||
      this.#source[this.#index] === '\r' ||
      this.#source[this.#index] === '\t'
    ) {
      this.#index += 1;
    }
  }

  private fail(): never {
    throw new WiroValidationError('Invalid JSON value.');
  }
}
