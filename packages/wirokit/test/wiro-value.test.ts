import { describe, expect, it } from 'vitest';

import {
  parseWiroJson,
  parseWiroValue,
  stringifyWiroJson,
  stringifyWiroValue,
  WiroFileInput,
  WiroFileInputValue,
  WiroNumberValue,
  WiroObjectValue,
  WiroValidationError,
  WiroValue,
  wiroValueEquals,
} from '../src';

describe('WiroValue JSON fidelity', () => {
  it('round-trips nested JSON without changing number lexemes', () => {
    const json =
      '{"precise":1.2300e+4,"large":123456789012345678901234567890,' +
      '"tiny":-9.001e-120,"nested":[true,null,{"name":"wiro"}]}';

    const value = parseWiroValue(json);

    expect(stringifyWiroValue(value)).toBe(json);
    expect(value).toBeInstanceOf(WiroObjectValue);
  });

  it.each([
    '',
    '01',
    '+1',
    '1.',
    '.5',
    'NaN',
    'Infinity',
    'true',
    '1e2147483649',
    '1e-2147483648',
  ])('rejects invalid number lexeme %s', (rawValue) => {
    expect(() => new WiroNumberValue(rawValue)).toThrow(WiroValidationError);
  });

  it('keeps lexeme equality distinct from numeric equality', () => {
    expect(
      WiroValue.numberLexeme('1.0').equals(WiroValue.numberLexeme('1.00')),
    ).toBe(false);
    expect(
      WiroValue.numberLexeme('1.0').equals(WiroValue.numberLexeme('1.0')),
    ).toBe(true);
  });

  it('provides finite and exact numeric accessors', () => {
    expect(WiroValue.numberLexeme('3.0').intValue).toBeNull();
    expect(WiroValue.numberLexeme('3').intValue).toBe(3);
    expect(WiroValue.numberLexeme('3.5').intValue).toBeNull();
    expect(WiroValue.numberLexeme('7.0e1').intValue).toBe(70);
    expect(WiroValue.string(' 42 ').intValue).toBe(42);
    expect(WiroValue.string('9007199254740992').intValue).toBeNull();
    expect(WiroValue.numberLexeme('1e400').doubleValue).toBeNull();
    expect(WiroValue.numberLexeme('1.5').doubleValue).toBe(1.5);
    expect(WiroValue.numberLexeme('7').toString()).toBe('7');
    expect(WiroValue.string('value').stringValue).toBe('value');
    expect(WiroValue.string(' 1.5 ').doubleValue).toBe(1.5);
    expect(WiroValue.string(' ').doubleValue).toBeNull();
    expect(WiroValue.boolean(true).booleanValue).toBe(true);
    expect(() => WiroValue.number(Infinity)).toThrow(WiroValidationError);
  });

  it('parses every scalar and empty container form', () => {
    expect(stringifyWiroValue(parseWiroValue(' "a\\nline" '))).toBe(
      '"a\\nline"',
    );
    expect(stringifyWiroValue(parseWiroValue(' \n\r\tfalse \t'))).toBe('false');
    expect(stringifyWiroValue(parseWiroValue('{}'))).toBe('{}');
    expect(stringifyWiroValue(parseWiroValue('[]'))).toBe('[]');
    expect(stringifyWiroValue(WiroValue.null)).toBe('null');
    expect(() => parseWiroJson('[]')).toThrow('Expected a JSON object.');
  });

  it('preserves unknown object fields for inspection', () => {
    const value = parseWiroJson(
      '{"known":true,"future":{"kind":"new","value":7}}',
    );

    expect(value.future).toBeInstanceOf(WiroObjectValue);
    expect(stringifyWiroJson(value)).toBe(
      '{"known":true,"future":{"kind":"new","value":7}}',
    );
  });
});

describe('WiroValue immutability and validation', () => {
  it('defensively copies object and array containers', () => {
    const sourceArray = [WiroValue.string('first')];
    const sourceObject = {
      items: WiroValue.array(sourceArray),
    };
    const value = WiroValue.object(sourceObject);

    sourceArray.push(WiroValue.string('second'));
    sourceObject.items = WiroValue.array([]);

    expect(value.value.items?.kind).toBe('array');
    expect(
      value.value.items?.kind === 'array' ? value.value.items.value : [],
    ).toHaveLength(1);
    expect(Object.isFrozen(value.value)).toBe(true);
    expect(value.objectValue).toBe(value.value);
    expect(
      value.value.items?.kind === 'array' ? value.value.items.arrayValue : [],
    ).toHaveLength(1);
  });

  it('converts supported JavaScript values and rejects cycles', () => {
    const converted = WiroValue.fromUnknown({
      count: 123456789012345678901234567890n,
      enabled: true,
      values: ['a', null],
    });

    expect(stringifyWiroValue(converted)).toBe(
      '{"count":123456789012345678901234567890,' +
        '"enabled":true,"values":["a",null]}',
    );

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => WiroValue.fromUnknown(cyclic)).toThrow(
      'JSON value must not contain cycles.',
    );
    expect(() => WiroValue.fromUnknown(undefined)).toThrow(WiroValidationError);
    expect(stringifyWiroValue(WiroValue.fromUnknown(1.5))).toBe('1.5');
    expect(() => WiroValue.fromUnknown(new Date())).toThrow(
      'Unsupported JSON object.',
    );
  });

  it('handles __proto__ as data without prototype pollution', () => {
    const parsed = parseWiroJson('{"__proto__":{"polluted":true}}');

    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(
      true,
    );
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects malformed JSON without echoing its contents', () => {
    const secret = 'private-response-body';

    expect.assertions(3);
    try {
      parseWiroValue(`{"value":"${secret}"`);
    } catch (error) {
      expect(error).toBeInstanceOf(WiroValidationError);
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });

  it.each([
    'true false',
    'tru',
    'x',
    '{bad:1}',
    '{"a" 1}',
    '{"a":1 "b":2}',
    '[1 2]',
    '"unterminated',
    '"\\x"',
  ])('rejects malformed JSON syntax %#', (json) => {
    expect(() => parseWiroValue(json)).toThrow(WiroValidationError);
  });

  it('rejects excessive parser and object nesting', () => {
    const deeplyNestedJson = '['.repeat(130) + 'null' + ']'.repeat(130);
    expect(() => parseWiroValue(deeplyNestedJson)).toThrow(
      'JSON value exceeds the maximum nesting depth.',
    );

    let deeplyNested: unknown = null;
    for (let index = 0; index < 130; index += 1) {
      deeplyNested = [deeplyNested];
    }
    expect(() => WiroValue.fromUnknown(deeplyNested)).toThrow(
      'JSON value exceeds the maximum nesting depth.',
    );
  });

  it('rejects unresolved files without leaking metadata', () => {
    const secretName = 'private-image.png';
    const value = WiroValue.object({
      nested: WiroValue.array([
        WiroValue.fileInput(
          WiroFileInput.bytes(new Uint8Array([1, 2, 3]), secretName),
        ),
      ]),
    });

    expect(() => stringifyWiroValue(value)).toThrow(WiroValidationError);
    try {
      stringifyWiroValue(value);
    } catch (error) {
      expect(String(error)).not.toContain(secretName);
    }
  });

  it('compares nested values structurally', () => {
    const left = parseWiroValue('{"a":[1,true,null]}');
    const right = parseWiroValue('{"a":[1,true,null]}');
    const different = parseWiroValue('{"a":[1,false,null]}');

    expect(wiroValueEquals(left, right)).toBe(true);
    expect(wiroValueEquals(left, different)).toBe(false);
  });

  it('covers scalar, container, and file value equality', () => {
    expect(WiroValue.string('a').equals(WiroValue.string('a'))).toBe(true);
    expect(WiroValue.string('a').equals(WiroValue.string('b'))).toBe(false);
    expect(WiroValue.string('a').equals({})).toBe(false);
    expect(WiroValue.boolean(true).equals(WiroValue.boolean(false))).toBe(
      false,
    );
    expect(WiroValue.boolean(true).equals({})).toBe(false);
    expect(WiroValue.null.equals(WiroValue.null)).toBe(true);
    expect(WiroValue.null.equals({})).toBe(false);

    const object = WiroValue.object({
      a: WiroValue.string('a'),
    });
    expect(object.equals({})).toBe(false);
    expect(object.equals(WiroValue.object({}))).toBe(false);
    expect(object.equals(WiroValue.object({ b: WiroValue.string('a') }))).toBe(
      false,
    );

    const array = WiroValue.array([WiroValue.string('a')]);
    expect(array.equals({})).toBe(false);
    expect(array.equals(WiroValue.array([]))).toBe(false);
    expect(array.equals(WiroValue.array([WiroValue.string('different')]))).toBe(
      false,
    );

    const fileInput = WiroFileInput.bytes(new Uint8Array([1]), 'input.bin');
    const fileValue = new WiroFileInputValue(fileInput);
    expect(fileValue.fileInputValue).toBe(fileInput);
    expect(fileValue.toString()).not.toContain('input.bin');
    expect(fileValue.equals(new WiroFileInputValue(fileInput))).toBe(true);
    expect(fileValue.equals({})).toBe(false);
  });
});
