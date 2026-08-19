import {
  WiroError,
  WiroNetworkError,
  WiroValidationError,
} from '../errors/wiro-error';
import {
  iterateExactByteStream,
  type WiroByteStream,
} from '../internal/byte-stream';
import { buildMultipartFileFraming } from '../internal/multipart-form-data';
import { createAbortError, isAbortError } from '../internal/runtime';
import { utf8ByteLength } from '../internal/utf8';
import { WiroHttpResponse } from './http-transport';

const FILE_WRITE_CHUNK_BYTES = 256 * 1024;

interface ExpoFileSystemModule {
  readonly Directory: new (
    ...uris: (string | ExpoFile | ExpoDirectory)[]
  ) => ExpoDirectory;
  readonly File: new (
    ...uris: (string | ExpoFile | ExpoDirectory)[]
  ) => ExpoFile;
  readonly Paths: {
    readonly cache: ExpoDirectory;
  };
}

interface ExpoDirectory {
  readonly exists: boolean;
  readonly uri: string;
  create(options?: { readonly intermediates?: boolean }): void;
  delete(): void;
}

interface ExpoFile {
  readonly uri: string;
  create(): void;
  open(): ExpoFileHandle;
}

interface ExpoFileHandle {
  close(): void;
  writeBytes(bytes: Uint8Array): void;
}

interface ExpoUploadProgress {
  readonly totalBytesExpectedToSend: number;
  readonly totalBytesSent: number;
}

interface ExpoUploadResult {
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly status: number;
}

interface ExpoUploadTask {
  cancelAsync(): Promise<void>;
  uploadAsync(): Promise<ExpoUploadResult | null | undefined>;
}

interface ExpoLegacyFileSystemModule {
  readonly FileSystemSessionType: {
    readonly FOREGROUND: number;
  };
  readonly FileSystemUploadType: {
    readonly BINARY_CONTENT: number;
  };
  createUploadTask(
    url: string,
    fileUri: string,
    options: {
      readonly headers: Record<string, string>;
      readonly httpMethod: 'POST';
      readonly sessionType: number;
      readonly uploadType: number;
    },
    callback?: (progress: ExpoUploadProgress) => void,
  ): ExpoUploadTask;
}

export type WiroStreamUploadProgress =
  | {
      readonly bytesProcessed: number;
      readonly phase: 'spooling';
      readonly totalBytes: number;
    }
  | {
      readonly bytesSent: number;
      readonly phase: 'uploading';
      readonly totalBytes: number;
    };

export interface WiroStreamUploadRequest {
  readonly contentLength: number;
  readonly fileName: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly maxResponseBodyBytes: number;
  readonly onProgress?: (progress: WiroStreamUploadProgress) => void;
  readonly signal?: AbortSignal;
  readonly stream: WiroByteStream;
  readonly url: string;
}

export interface WiroStreamUploadTransport {
  dispose(): void;
  upload(request: WiroStreamUploadRequest): Promise<WiroHttpResponse>;
}

export class WiroStreamUploadTransportImpl implements WiroStreamUploadTransport {
  readonly #tasks = new Set<ExpoUploadTask>();
  readonly #moduleLoader: () => readonly [unknown, unknown];
  #disposed = false;

  constructor(moduleLoader: () => readonly [unknown, unknown]) {
    this.#moduleLoader = moduleLoader;
  }

  async upload(request: WiroStreamUploadRequest): Promise<WiroHttpResponse> {
    if (this.#disposed) {
      throw new WiroValidationError('Stream upload transport is disposed.');
    }
    throwIfAborted(request.signal);

    const [fileSystemModule, legacyModule] = this.#moduleLoader();
    const fileSystem = fileSystemModule as ExpoFileSystemModule;
    const legacy = legacyModule as ExpoLegacyFileSystemModule;
    throwIfAborted(request.signal);

    const directory = new fileSystem.Directory(
      fileSystem.Paths.cache,
      `wirokit-upload-${uniqueSuffix()}`,
    );
    directory.create({ intermediates: true });
    const file = new fileSystem.File(directory, request.fileName);
    const framing = buildMultipartFileFraming(request.fileName);

    try {
      file.create();
      const handle = file.open();
      try {
        writeBounded(handle, framing.prefix, request.signal);
        let bytesProcessed = 0;
        for await (const chunk of iterateExactByteStream(
          request.stream,
          request.contentLength,
          request.signal,
        )) {
          writeBounded(handle, chunk, request.signal);
          bytesProcessed += chunk.byteLength;
          request.onProgress?.({
            bytesProcessed,
            phase: 'spooling',
            totalBytes: request.contentLength,
          });
        }
        writeBounded(handle, framing.suffix, request.signal);
      } finally {
        handle.close();
      }

      throwIfAborted(request.signal);
      const task = legacy.createUploadTask(
        request.url,
        file.uri,
        {
          headers: {
            ...request.headers,
            'Content-Type': framing.contentType,
          },
          httpMethod: 'POST',
          sessionType: legacy.FileSystemSessionType.FOREGROUND,
          uploadType: legacy.FileSystemUploadType.BINARY_CONTENT,
        },
        (progress) => {
          request.onProgress?.({
            bytesSent: progress.totalBytesSent,
            phase: 'uploading',
            totalBytes: progress.totalBytesExpectedToSend,
          });
        },
      );
      this.#tasks.add(task);
      try {
        const result = await runUploadTask(task, request.signal);
        if (result === null || result === undefined) {
          throw request.signal?.reason ?? createAbortError();
        }
        if (utf8ByteLength(result.body) > request.maxResponseBodyBytes) {
          throw new WiroValidationError(
            'Response body exceeds the configured REST payload limit.',
          );
        }
        return new WiroHttpResponse({
          body: result.body,
          headers: result.headers,
          statusCode: result.status,
        });
      } finally {
        this.#tasks.delete(task);
      }
    } catch (error) {
      if (request.signal?.aborted === true) {
        throw request.signal.reason ?? createAbortError();
      }
      if (error instanceof WiroError || isAbortError(error)) {
        throw error;
      }
      throw new WiroNetworkError(
        'The stream upload failed.',
        errorTypeName(error),
      );
    } finally {
      try {
        if (directory.exists) {
          directory.delete();
        }
      } catch {
        // Best-effort temporary file cleanup.
      }
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const task of this.#tasks) {
      void task.cancelAsync().catch(() => undefined);
    }
    this.#tasks.clear();
  }
}

async function runUploadTask(
  task: ExpoUploadTask,
  signal: AbortSignal | undefined,
): Promise<ExpoUploadResult | null | undefined> {
  if (signal?.aborted === true) {
    await cancelTask(task);
    throw signal.reason ?? createAbortError();
  }

  const abort = (): void => {
    void cancelTask(task);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await task.uploadAsync();
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

async function cancelTask(task: ExpoUploadTask): Promise<void> {
  try {
    await task.cancelAsync();
  } catch {
    // Best-effort native task cancellation.
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}

function writeBounded(
  handle: ExpoFileHandle,
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
): void {
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += FILE_WRITE_CHUNK_BYTES
  ) {
    throwIfAborted(signal);
    handle.writeBytes(
      bytes.subarray(
        offset,
        Math.min(offset + FILE_WRITE_CHUNK_BYTES, bytes.byteLength),
      ),
    );
  }
}

let uploadSequence = 0;

function uniqueSuffix(): string {
  uploadSequence += 1;
  return `${Date.now().toString(36)}-${uploadSequence.toString(36)}`;
}

function errorTypeName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error';
}
