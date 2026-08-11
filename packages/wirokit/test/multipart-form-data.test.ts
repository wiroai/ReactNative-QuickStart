import { describe, expect, it } from 'vitest';

import { WiroHttpRequest } from '../src';
import {
  buildMultipartFilePart,
  escapeMultipartFileName,
} from '../src/internal/multipart-form-data';
import { encodeUtf8 } from '../src/internal/utf8';

describe('multipart file part', () => {
  it('matches the fixed Swift and Kotlin golden bytes', () => {
    const multipart = buildMultipartFilePart({
      boundary: 'Boundary-TESTFIXED0001',
      bytes: encodeUtf8('hello-bytes'),
      fileName: 'photo.png',
    });
    const expected =
      '--Boundary-TESTFIXED0001\r\n' +
      'Content-Disposition: form-data; name="file"; ' +
      'filename="photo.png"\r\n' +
      'Content-Type: application/octet-stream\r\n' +
      '\r\nhello-bytes\r\n' +
      '--Boundary-TESTFIXED0001--\r\n';

    expect(asAscii(multipart.body)).toBe(expected);
    expect(multipart.body.byteLength).toBe(176);
    expect(multipart.contentType).toBe(
      'multipart/form-data; ' + 'boundary=Boundary-TESTFIXED0001',
    );
  });

  it.each([
    ['a\\b', 'a\\\\b'],
    ['a"b', 'a\\"b'],
    ['a\\"b', 'a\\\\\\"b'],
  ])('escapes filename %s', (input, expected) => {
    expect(escapeMultipartFileName(input)).toBe(expected);
  });

  it('rejects unsafe test boundaries', () => {
    expect(() =>
      buildMultipartFilePart({
        boundary: 'bad\r\nboundary',
        bytes: new Uint8Array(),
        fileName: 'file.bin',
      }),
    ).toThrow('Invalid multipart boundary.');
  });

  it('defensively copies multipart and request bytes', () => {
    const source = new Uint8Array([1, 2, 3]);
    const multipart = buildMultipartFilePart({
      boundary: 'Boundary-copy',
      bytes: source,
      fileName: 'file.bin',
    });
    source[0] = 9;
    const exposed = multipart.body;
    exposed.fill(0);
    const request = new WiroHttpRequest({
      binaryBody: multipart.body,
      maxResponseBodyBytes: 1_024,
      method: 'POST',
      timeoutMs: 1_000,
      url: 'https://example.com/upload',
    });
    const requestBytes = request.binaryBody;
    if (requestBytes instanceof Uint8Array) {
      requestBytes.fill(0);
    }

    expect(multipart.body).toContain(1);
    expect(request.binaryBody).toEqual(multipart.body);
  });

  it('prevents simultaneous text and binary bodies', () => {
    expect(
      () =>
        new WiroHttpRequest({
          binaryBody: new Uint8Array(),
          body: '{}',
          maxResponseBodyBytes: 1_024,
          method: 'POST',
          timeoutMs: 1_000,
          url: 'https://example.com/upload',
        }),
    ).toThrow('HTTP request cannot contain multiple body types.');
  });
});

function asAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}
