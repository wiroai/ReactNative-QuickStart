import {
  WiroArrayValue,
  WiroBooleanValue,
  type WiroJson,
  WiroNumberValue,
  WiroStringValue,
  type WiroValue,
} from '../core/wiro-value';

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

export function readList(
  value: WiroValue | undefined,
): readonly WiroValue[] | undefined {
  return value instanceof WiroArrayValue ? value.value : undefined;
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
