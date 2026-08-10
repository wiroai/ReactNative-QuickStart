import { describe, expect, it } from 'vitest';

import {
  WiroBlobFileInput,
  WiroBytesFileInput,
  WiroFileInput,
  WiroUriFileInput,
  WiroValidationError,
} from '../src';
import {
  requireNonNegativeDuration,
  requirePositiveDuration,
  validateBaseUrl,
  validateCallbackUrl,
  validateFileName,
  validateHeader,
  validateWebSocketUrl,
} from '../src/internal/validation';

describe('WiroFileInput', () => {
  it('preserves signed remote URLs while redacting string output', () => {
    const url = 'https://cdn.example.com/image.png?signature=secret%2Bvalue';
    const input = WiroFileInput.url(url);

    expect(input.wireValue).toBe(url);
    expect(input.url).toBe(url);
    expect(input.toString()).not.toContain('secret');
    expect(input.equals(WiroFileInput.url(url))).toBe(true);
    expect(WiroFileInput.url(new URL('https://example.com/file')).url).toBe(
      'https://example.com/file',
    );
    expect(input.equals(WiroFileInput.url('https://example.com'))).toBe(false);
    expect(input.equals({})).toBe(false);
  });

  it.each([
    'ftp://example.com/file',
    '/relative/file',
    'https://user:secret@example.com/file',
    'https://@example.com/file',
    'https://example.com/file#secret',
  ])('rejects unsafe remote URL %s', (url) => {
    expect(() => WiroFileInput.url(url)).toThrow(WiroValidationError);
  });

  it('defensively copies byte input and output', () => {
    const source = new Uint8Array([1, 2, 3]);
    const input = WiroFileInput.bytes(
      source,
      ' image.bin ',
      'application/octet-stream',
    );

    source[0] = 9;
    const exposed = input.bytes;
    exposed[1] = 9;

    expect([...input.bytes]).toEqual([1, 2, 3]);
    expect(input.fileName).toBe('image.bin');
    expect(input.wireValue).toBeNull();
    expect(input.toString()).toBe('WiroFileInput.Bytes(size=3)');
    expect(
      input.equals(
        new WiroBytesFileInput(
          new Uint8Array([1, 2, 3]),
          'image.bin',
          'application/octet-stream',
        ),
      ),
    ).toBe(true);
    expect(input.equals({})).toBe(false);
    expect(
      input.equals(
        WiroFileInput.bytes(
          new Uint8Array([1, 2]),
          'image.bin',
          'application/octet-stream',
        ),
      ),
    ).toBe(false);
    expect(
      input.equals(
        WiroFileInput.bytes(
          new Uint8Array([1, 2, 4]),
          'image.bin',
          'application/octet-stream',
        ),
      ),
    ).toBe(false);
    expect(
      input.equals(
        WiroFileInput.bytes(
          new Uint8Array([1, 2, 3]),
          'other.bin',
          'application/octet-stream',
        ),
      ),
    ).toBe(false);
  });

  it('supports immutable Blob inputs', () => {
    const blob = new Blob(['wiro'], { type: 'text/plain' });
    const input = WiroFileInput.blob(blob, 'input.txt');

    expect(input).toBeInstanceOf(WiroBlobFileInput);
    expect(input.blob).not.toBe(blob);
    expect(input.blob.size).toBe(blob.size);
    expect(input.mediaType).toBe('text/plain');
    expect(input.wireValue).toBeNull();
    expect(input.toString()).toBe('WiroFileInput.Blob(size=4)');
    expect(input.equals(new WiroBlobFileInput(blob, 'input.txt'))).toBe(true);
    expect(
      input.equals(
        new WiroBlobFileInput(new Blob(['wiro']), 'input.txt', 'text/plain'),
      ),
    ).toBe(false);
  });

  it('supports Expo-compatible URIs without exposing them', () => {
    const input = WiroFileInput.uri('file:///private/image.png', {
      fileName: 'image.png',
      mediaType: 'image/png',
      sizeBytes: 42,
    });

    expect(input).toBeInstanceOf(WiroUriFileInput);
    expect(input.uri).toBe('file:///private/image.png');
    expect(input.sizeBytes).toBe(42);
    expect(input.wireValue).toBeNull();
    expect(input.toString()).not.toContain('/private/');
    expect(
      input.equals(
        new WiroUriFileInput('file:///private/image.png', {
          fileName: 'image.png',
          mediaType: 'image/png',
          sizeBytes: 42,
        }),
      ),
    ).toBe(true);
    expect(input.equals(WiroFileInput.uri('file:///other'))).toBe(false);
    expect(input.equals({})).toBe(false);
  });

  it('supports minimal URI metadata and validates optional fields', () => {
    const input = WiroFileInput.uri('content://picker/item');

    expect(input.fileName).toBeUndefined();
    expect(input.mediaType).toBeUndefined();
    expect(input.sizeBytes).toBeUndefined();

    expect(() =>
      WiroFileInput.bytes(new Uint8Array(), 'file.bin', ' '),
    ).toThrow('Invalid media type.');
    expect(() => WiroFileInput.uri('file:///item', { sizeBytes: -1 })).toThrow(
      'sizeBytes must be a non-negative safe integer.',
    );
  });

  it.each(['', 'relative/path.png', 'file:///image.png\r\nx-header: value'])(
    'rejects invalid Expo URI %s',
    (uri) => {
      expect(() => WiroFileInput.uri(uri)).toThrow(WiroValidationError);
    },
  );
});

describe('safe validators', () => {
  it('validates and trims base transport URLs', () => {
    expect(validateBaseUrl('https://api.wiro.ai/v1///')).toBe(
      'https://api.wiro.ai/v1',
    );
    expect(validateWebSocketUrl('wss://socket.wiro.ai/v1/')).toBe(
      'wss://socket.wiro.ai/v1',
    );
    expect(validateCallbackUrl('https://app.example.com/callback?task=1')).toBe(
      'https://app.example.com/callback?task=1',
    );
    expect(validateBaseUrl('https://example.com')).toBe('https://example.com');
  });

  it.each([
    'ftp://api.wiro.ai/v1',
    'https://api.wiro.ai/v1?secret=1',
    'https://api.wiro.ai/v1#fragment',
    'https://user:secret@api.wiro.ai/v1',
    ' https://api.wiro.ai/v1',
  ])('rejects invalid base URL %s', (url) => {
    expect(() => validateBaseUrl(url)).toThrow(WiroValidationError);
  });

  it('rejects callback fragments and userinfo', () => {
    expect(() =>
      validateCallbackUrl('https://example.com/callback#token'),
    ).toThrow(WiroValidationError);
    expect(() =>
      validateCallbackUrl('https://user:secret@example.com/callback'),
    ).toThrow(WiroValidationError);
  });

  it('validates header names and values', () => {
    expect(() => validateHeader('x-safe_header', 'safe value')).not.toThrow();

    for (const name of ['', 'bad name', 'x-test\r\ninjected']) {
      expect(() => validateHeader(name, 'value')).toThrow(
        'Invalid HTTP header name.',
      );
    }
    for (const value of [
      'value\r\nx-injected: yes',
      'value\nnext',
      'value\u0000next',
    ]) {
      expect(() => validateHeader('x-name', value)).toThrow(
        'Invalid HTTP header value.',
      );
    }
  });

  it('validates upload file names at security boundaries', () => {
    expect(validateFileName(` ${'a'.repeat(255)} `)).toBe('a'.repeat(255));

    for (const value of [
      '',
      ' ',
      'path/file.png',
      'path\\file.png',
      'file\r\nname.png',
      `${'a'.repeat(256)}`,
    ]) {
      expect(() => validateFileName(value)).toThrow(WiroValidationError);
    }
  });

  it('validates positive and non-negative durations', () => {
    expect(requirePositiveDuration(1, 'timeout')).toBe(1);
    expect(requireNonNegativeDuration(0, 'delay')).toBe(0);

    for (const value of [0, -1, Number.NaN, Infinity]) {
      expect(() => requirePositiveDuration(value, 'timeout')).toThrow(
        WiroValidationError,
      );
    }
    for (const value of [-1, Number.NaN, Infinity]) {
      expect(() => requireNonNegativeDuration(value, 'delay')).toThrow(
        WiroValidationError,
      );
    }
  });
});
