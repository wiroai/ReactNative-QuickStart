import {
  WiroArrayValue,
  WiroBooleanValue,
  type WiroJson,
  WiroNumberValue,
  WiroObjectValue,
  WiroStringValue,
  type WiroValue,
  parseWiroValue,
} from '../core/wiro-value';

export type MalformedJsonHandler = (raw: string) => void;

export function readString(value: WiroValue | undefined): string | undefined {
  if (value instanceof WiroStringValue) {
    return value.value;
  }
  if (value instanceof WiroNumberValue) {
    return value.intValue?.toString() ?? value.rawValue;
  }
  if (value instanceof WiroBooleanValue) {
    return value.value ? 'true' : 'false';
  }
  return undefined;
}

export function readBoolean(value: WiroValue | undefined): boolean | undefined {
  if (value instanceof WiroBooleanValue) {
    return value.value;
  }
  if (value instanceof WiroStringValue) {
    switch (value.value.trim().toLowerCase()) {
      case 'true':
      case '1':
        return true;
      case 'false':
      case '0':
        return false;
      default:
        return undefined;
    }
  }
  if (value instanceof WiroNumberValue) {
    if (value.rawValue === '1') {
      return true;
    }
    if (value.rawValue === '0') {
      return false;
    }
  }
  return undefined;
}

export function readInteger(value: WiroValue | undefined): number | undefined {
  if (value instanceof WiroNumberValue || value instanceof WiroStringValue) {
    return value.intValue ?? undefined;
  }
  return undefined;
}

export function readDouble(value: WiroValue | undefined): number | undefined {
  if (value instanceof WiroNumberValue || value instanceof WiroStringValue) {
    return value.doubleValue ?? undefined;
  }
  return undefined;
}

export function readList(
  value: WiroValue | undefined,
): readonly WiroValue[] | undefined {
  return value instanceof WiroArrayValue ? value.value : undefined;
}

export function readValues(value: WiroValue | undefined): readonly WiroValue[] {
  return readList(value) ?? [];
}

export function readStringList(
  value: WiroValue | undefined,
): readonly string[] {
  return Object.freeze(
    readValues(value)
      .map(readString)
      .filter((item): item is string => item !== undefined),
  );
}

export function readObject(
  value: WiroValue | undefined,
  onMalformedJson?: MalformedJsonHandler,
): WiroJson | undefined {
  if (value instanceof WiroObjectValue) {
    return value.value;
  }
  if (!(value instanceof WiroStringValue)) {
    return undefined;
  }
  const trimmed = value.value.trim();
  if (trimmed.length === 0) {
    onMalformedJson?.(value.value);
    return EMPTY_JSON;
  }
  try {
    const decoded = parseWiroValue(trimmed);
    if (decoded instanceof WiroObjectValue) {
      return decoded.value;
    }
  } catch {
    // Report only through the caller's redacted handler.
  }
  onMalformedJson?.(value.value);
  return EMPTY_JSON;
}

export function readObjects(
  value: WiroValue | undefined,
  onMalformedJson?: MalformedJsonHandler,
): readonly WiroJson[] {
  return Object.freeze(
    readValues(value)
      .map((item) => readObject(item, onMalformedJson))
      .filter(
        (item): item is WiroJson =>
          item !== undefined && Object.keys(item).length > 0,
      ),
  );
}

export function readUrl(value: WiroValue | undefined): URL | undefined {
  if (!(value instanceof WiroStringValue)) {
    return undefined;
  }
  const trimmed = value.value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    return new URL(trimmed);
  } catch {
    return undefined;
  }
}

export function readDate(value: WiroValue | undefined): Date | undefined {
  const timestamp = readDouble(value);
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return undefined;
  }
  const milliseconds =
    Math.abs(timestamp) >= 1_000_000_000_000 ? timestamp : timestamp * 1_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function readObjectString(
  object: WiroJson,
  key: string,
): string | undefined {
  return readString(object[key]);
}

export function readObjectBoolean(
  object: WiroJson,
  key: string,
): boolean | undefined {
  return readBoolean(object[key]);
}

const EMPTY_JSON = Object.freeze(
  Object.create(null) as Record<string, WiroValue>,
);
