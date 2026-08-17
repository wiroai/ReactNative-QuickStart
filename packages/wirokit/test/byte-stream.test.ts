import { describe, expect, it } from 'vitest';

import {
  readExactByteStream,
  type WiroReadableByteStream,
} from '../src/internal/byte-stream';

describe('readExactByteStream', () => {
  it('concatenates async iterable chunks', async () => {
    const bytes = await readExactByteStream(chunks([1], [2, 3]), 3);

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reads a getReader stream of the declared length', async () => {
    const bytes = await readExactByteStream(
      readableStream([new Uint8Array([9, 8]), new Uint8Array([7])]),
      3,
    );

    expect(bytes).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('skips empty reader values and accepts an empty stream', async () => {
    let first = true;
    const stream: WiroReadableByteStream = {
      getReader() {
        return {
          async read() {
            if (first) {
              first = false;
              return { done: false };
            }
            return { done: true };
          },
          releaseLock() {},
        };
      },
    };

    await expect(readExactByteStream(stream, 0)).resolves.toEqual(
      new Uint8Array(),
    );
  });

  it('rejects non-Uint8Array chunks', async () => {
    async function* invalid(): AsyncGenerator<Uint8Array> {
      yield [1, 2] as unknown as Uint8Array;
    }

    await expect(readExactByteStream(invalid(), 2)).rejects.toThrow(
      'Upload stream chunks must be Uint8Array values.',
    );
  });

  it('preserves AbortError thrown by the stream', async () => {
    async function* aborting(): AsyncGenerator<Uint8Array> {
      throw new DOMException('aborted', 'AbortError');
    }

    await expect(readExactByteStream(aborting(), 1)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects a negative contentLength before reading', async () => {
    await expect(readExactByteStream(chunks([1]), -1)).rejects.toThrow(
      'contentLength cannot be negative.',
    );
  });

  it('rejects a stream that yields too many bytes', async () => {
    await expect(readExactByteStream(chunks([1, 2, 3]), 2)).rejects.toThrow(
      'Upload stream exceeded the declared contentLength.',
    );
  });

  it('rejects a stream that yields too few bytes', async () => {
    await expect(readExactByteStream(chunks([1]), 2)).rejects.toThrow(
      'Upload stream did not yield the declared contentLength.',
    );
  });

  it('preserves AbortError before reading', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      readExactByteStream(chunks([1]), 1, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves an abort reason while iterating', async () => {
    const controller = new AbortController();
    const reason = new Error('stopped');
    async function* aborting(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1]);
      controller.abort(reason);
      yield new Uint8Array([2]);
    }

    await expect(
      readExactByteStream(aborting(), 2, controller.signal),
    ).rejects.toBe(reason);
  });
});

async function* chunks(
  ...values: readonly number[][]
): AsyncGenerator<Uint8Array> {
  for (const value of values) {
    yield new Uint8Array(value);
  }
}

function readableStream(
  values: readonly Uint8Array[],
): WiroReadableByteStream {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          const value = values[index];
          if (value === undefined) {
            return { done: true };
          }
          index += 1;
          return { done: false, value };
        },
        releaseLock() {},
      };
    },
  };
}
