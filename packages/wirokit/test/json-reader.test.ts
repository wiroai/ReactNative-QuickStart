import { describe, expect, it } from 'vitest';

import { parseWiroValue, WiroObjectValue, WiroValue } from '../src';
import {
  readDate,
  readDouble,
  readInteger,
  readObject,
  readObjects,
  readStringList,
  readUrl,
} from '../src/internal/json-reader';

describe('lenient JSON reader', () => {
  it('reads integer, double, and string-list coercions', () => {
    expect(readInteger(WiroValue.string('42'))).toBe(42);
    expect(readInteger(WiroValue.string('1.5'))).toBeUndefined();
    expect(readInteger(WiroValue.boolean(true))).toBeUndefined();
    expect(readDouble(WiroValue.string('1.5'))).toBe(1.5);
    expect(readDouble(WiroValue.string('nope'))).toBeUndefined();
    expect(readDouble(WiroValue.boolean(false))).toBeUndefined();
    expect(
      readStringList(
        WiroValue.array([
          WiroValue.string('a'),
          WiroValue.number(2),
          WiroValue.null,
        ]),
      ),
    ).toEqual(['a', '2']);
  });

  it('decodes object strings and reports malformed values', () => {
    const malformed: string[] = [];
    const direct = WiroValue.object({
      value: WiroValue.string('direct'),
    });

    expect(readObject(direct)).toBe(direct.value);
    expect(readObject(WiroValue.number(1))).toBeUndefined();
    expect(
      readObject(WiroValue.string(''), (raw) => malformed.push(raw)),
    ).toEqual({});
    expect(
      readObject(WiroValue.string('[]'), (raw) => malformed.push(raw)),
    ).toEqual({});
    expect(
      readObject(WiroValue.string('{bad'), (raw) => malformed.push(raw)),
    ).toEqual({});
    expect(malformed).toEqual(['', '[]', '{bad']);
  });

  it('filters absent, empty, and non-object list elements', () => {
    const objects = readObjects(
      WiroValue.array([
        WiroValue.object({}),
        WiroValue.number(1),
        WiroValue.string('{"id":"nested"}'),
      ]),
    );

    expect(objects).toHaveLength(1);
    expect(objects[0]?.id).toEqual(WiroValue.string('nested'));
    expect(readObjects(undefined)).toEqual([]);
  });

  it('accepts only valid non-empty string URLs', () => {
    expect(readUrl(WiroValue.number(1))).toBeUndefined();
    expect(readUrl(WiroValue.string('  '))).toBeUndefined();
    expect(readUrl(WiroValue.string('not a url'))).toBeUndefined();
    expect(
      readUrl(WiroValue.string(' https://example.com/path '))?.toString(),
    ).toBe('https://example.com/path');
  });

  it('parses finite second and millisecond timestamps', () => {
    expect(readDate(WiroValue.number(1_700_000_000))?.getTime()).toBe(
      1_700_000_000_000,
    );
    expect(readDate(WiroValue.string('1700000000000'))?.getTime()).toBe(
      1_700_000_000_000,
    );
    expect(readDate(WiroValue.string('invalid'))).toBeUndefined();
    expect(readDate(parseWiroValue('1e2147483648'))).toBeUndefined();
  });

  it('returns parsed object instances from nested JSON', () => {
    const object = readObject(WiroValue.string('{"value":true}'));

    expect(
      object === undefined ? undefined : new WiroObjectValue(object).kind,
    ).toBe('object');
  });
});
