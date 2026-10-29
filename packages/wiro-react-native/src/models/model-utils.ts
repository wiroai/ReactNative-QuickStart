import type { WiroJson, WiroValue } from '../core/wiro-value';

export function immutableJson(value: WiroJson): WiroJson {
  const copied = Object.create(null) as Record<string, WiroValue>;
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(copied, key, {
      configurable: false,
      enumerable: true,
      value: item,
      writable: false,
    });
  }
  return Object.freeze(copied);
}

export function immutableArray<T>(value: readonly T[]): readonly T[] {
  return Object.freeze([...value]);
}
