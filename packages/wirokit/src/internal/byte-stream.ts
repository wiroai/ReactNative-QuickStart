import { WiroValidationError } from '../errors/wiro-error';
import { createAbortError, isAbortError } from './runtime';

export interface WiroReadableByteStream {
  getReader(): WiroByteStreamReader;
}

export interface WiroByteStreamReader {
  cancel?(reason?: unknown): Promise<void>;
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
  validateContentLength(contentLength);
  throwIfAborted(signal);
  const bytes = new Uint8Array(contentLength);
  let offset = 0;
  for await (const chunk of iterateExactByteStream(
    stream,
    contentLength,
    signal,
  )) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function* iterateExactByteStream(
  stream: WiroByteStream,
  contentLength: number,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array, void, void> {
  validateContentLength(contentLength);
  throwIfAborted(signal);

  let offset = 0;
  const iterator = byteStreamIterator(stream);

  try {
    for (;;) {
      const { done, value: chunk } = await nextChunk(iterator, signal);
      if (done) {
        break;
      }
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
      offset += chunk.byteLength;
      yield chunk;
    }
  } catch (error) {
    if (signal?.aborted === true) {
      void closeIterator(iterator, error);
      throw signal.reason ?? createAbortError();
    }
    await closeIterator(iterator, error);
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
}

function byteStreamIterator(stream: WiroByteStream): AsyncIterator<Uint8Array> {
  if (isAsyncIterable(stream)) {
    return stream[Symbol.asyncIterator]();
  }
  return readableStreamIterator(stream);
}

function isAsyncIterable(
  value: WiroByteStream,
): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function readableStreamIterator(
  stream: WiroReadableByteStream,
): AsyncIterator<Uint8Array> {
  const reader = stream.getReader();
  let released = false;
  const release = (): void => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  return {
    async next(): Promise<IteratorResult<Uint8Array>> {
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          release();
          return { done: true, value: undefined };
        }
        if (result.value !== undefined) {
          return { done: false, value: result.value };
        }
      }
    },
    async return(): Promise<IteratorResult<Uint8Array>> {
      try {
        await reader.cancel?.();
      } finally {
        release();
      }
      return { done: true, value: undefined };
    },
  };
}

function nextChunk(
  iterator: AsyncIterator<Uint8Array>,
  signal: AbortSignal | undefined,
): Promise<IteratorResult<Uint8Array>> {
  const operation = iterator.next();
  if (signal === undefined) {
    return operation;
  }
  if (signal.aborted) {
    void closeIterator(iterator, signal.reason);
    void operation.catch(() => undefined);
    return Promise.reject(signal.reason ?? createAbortError());
  }
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      void closeIterator(iterator, signal.reason);
      reject(signal.reason ?? createAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (result) => {
        signal.removeEventListener('abort', abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

async function closeIterator(
  iterator: AsyncIterator<Uint8Array>,
  reason: unknown,
): Promise<void> {
  try {
    await iterator.return?.(reason);
  } catch {
    // Best-effort stream cleanup.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}

function validateContentLength(contentLength: number): void {
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new WiroValidationError('contentLength cannot be negative.');
  }
}
