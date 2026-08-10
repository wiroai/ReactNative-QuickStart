import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWiroSignature } from '../src/internal/signature';
import { encodeUtf8, utf8ByteLength } from '../src/internal/utf8';

describe('Wiro HMAC signature', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches the shared Swift and Kotlin golden vector', () => {
    expect(
      createWiroSignature('test-api-key', 'test-secret', '1700000000000'),
    ).toBe('2d99fa1b6934f66a712785d1b402997e1b13d9d7cd5e0085211dac133ae4a8ef');
  });

  it('matches the additional Kotlin stability vector', () => {
    const signature = createWiroSignature('api', 'secret', 'nonce-1');

    expect(signature).toBe(
      'd453af9a65c4ddd1ff17d5b03d3224b906899f3445dc4b4aadb5580260c60586',
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('does not require native crypto or random APIs', () => {
    vi.stubGlobal('TextEncoder', undefined);
    vi.stubGlobal('crypto', undefined);

    expect(
      createWiroSignature('test-api-key', 'test-secret', '1700000000000'),
    ).toBe('2d99fa1b6934f66a712785d1b402997e1b13d9d7cd5e0085211dac133ae4a8ef');
  });
});

describe('portable UTF-8 encoding', () => {
  it('encodes ASCII, BMP, and supplementary characters', () => {
    expect([...encodeUtf8('A¢€😀')]).toEqual([
      0x41, 0xc2, 0xa2, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80,
    ]);
    expect(utf8ByteLength('A¢€😀')).toBe(10);
  });

  it('replaces unpaired UTF-16 surrogates', () => {
    expect([...encodeUtf8('\ud800')]).toEqual([0xef, 0xbf, 0xbd]);
    expect([...encodeUtf8('\udc00')]).toEqual([0xef, 0xbf, 0xbd]);
  });
});
