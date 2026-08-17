import { WiroValidationError } from '../errors/wiro-error';
import { createAbortError, isAbortError } from './runtime';

export interface WiroReadableByteStream {
  getReader(): WiroByteStreamReader;
}

export interface WiroByteStreamReader {
  read(): Promise<WiroByteStreamReadResult>;
  releaseLock(): void;
}

export interface WiroByteStreamReadResult {
  readonly done: boolean;
  readonly value?: Uint8Array;
}

export type WiroByteStream = AsyncIterable<Uint8Array> | WiroReadableByteStream;

export async function readExactByteStream(
  stream: WiroByteStream,
  contentLength: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new WiroValidationError('contentLength cannot be negative.');
  }
  throwIfAborted(signal);

  const bytes = new Uint8Array(contentLength);
  let offset = 0;

  try {
    for await (const chunk of iterateByteStream(stream)) {
      throwIfAborted(signal);
      if (!(chunk instanceof Uint8Array)) {
        throw new WiroValidationError(
          'Upload stream chunks must be Uint8Array values.',
        );
      }
      if (offset + chunk.byteLength > contentLength) {
        throw new WiroValidationError(
          'Upload stream exceeded the declared contentLength.',
        );
      }
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } catch (error) {
    if (signal?.aborted === true) {
      throw signal.reason ?? createAbortError();
    }
    if (isAbortError(error)) {
      throw error;
    }
    throw error;
  }

  throwIfAborted(signal);
  if (offset !== contentLength) {
    throw new WiroValidationError(
      'Upload stream did not yield the declared contentLength.',
    );
  }
  return bytes;
}

function iterateByteStream(stream: WiroByteStream): AsyncIterable<Uint8Array> {
  if (isAsyncIterable(stream)) {
    return stream;
  }
  return readableStreamToIterable(stream);
}

function isAsyncIterable(
  value: WiroByteStream,
): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

async function* readableStreamToIterable(
  stream: WiroReadableByteStream,
): AsyncGenerator<Uint8Array, void, void> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      if (value !== undefined) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}
