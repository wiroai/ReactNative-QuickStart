import { describe, expect, it } from 'vitest';

import { type WiroStreamUploadProgress, WiroValidationError } from '../src';
import { WiroStreamUploadTransportImpl } from '../src/transport/stream-upload-transport-impl';

describe('ExpoWiroStreamUploadTransport', () => {
  it('spools bounded chunks and uploads the exact file as multipart', async () => {
    const runtime = new FakeExpoFileSystem();
    const transport = runtime.transport();
    const contentLength = 1024 * 1024 + 7;
    const progress: WiroStreamUploadProgress[] = [];

    const response = await transport.upload({
      contentLength,
      fileName: 'payload.bin',
      headers: { 'x-api-key': 'test-key' },
      maxResponseBodyBytes: 1_024,
      onProgress: (event) => progress.push(event),
      stream: generatedBytes(contentLength, 700 * 1024),
      url: 'https://api.wiro.ai/v1/File/Upload',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"result":true}');
    expect(runtime.fileName).toBe('payload.bin');
    expect(runtime.totalWritten).toBeGreaterThan(contentLength);
    expect(runtime.maximumWriteBytes).toBeLessThanOrEqual(256 * 1024);
    expect(runtime.framingText).toContain(
      'name="file"; filename="payload.bin"',
    );
    expect(runtime.framingText).toContain(
      'Content-Type: application/octet-stream',
    );
    expect(runtime.directoryDeleted).toBe(true);
    expect(runtime.uploadOptions).toMatchObject({
      headers: {
        'Content-Type': expect.stringMatching(
          /^multipart\/form-data; boundary=Boundary-/u,
        ),
        'x-api-key': 'test-key',
      },
      httpMethod: 'POST',
      sessionType: 1,
      uploadType: 0,
    });
    expect(progress.some((event) => event.phase === 'spooling')).toBe(true);
    expect(progress.some((event) => event.phase === 'uploading')).toBe(true);
  });

  it('rejects declared length mismatches before native upload', async () => {
    const runtime = new FakeExpoFileSystem();
    const transport = runtime.transport();

    await expect(
      transport.upload({
        contentLength: 2,
        fileName: 'short.bin',
        headers: {},
        maxResponseBodyBytes: 1_024,
        stream: generatedBytes(1, 1),
        url: 'https://api.wiro.ai/v1/File/Upload',
      }),
    ).rejects.toThrow(
      'Upload stream did not yield the declared contentLength.',
    );
    expect(runtime.uploadStarted).toBe(false);
    expect(runtime.directoryDeleted).toBe(true);
  });

  it('cancels the native task when the signal aborts', async () => {
    const controller = new AbortController();
    const runtime = new FakeExpoFileSystem(() => {
      controller.abort(new Error('cancelled by test'));
    });
    const transport = runtime.transport();

    await expect(
      transport.upload({
        contentLength: 1,
        fileName: 'cancel.bin',
        headers: {},
        maxResponseBodyBytes: 1_024,
        signal: controller.signal,
        stream: generatedBytes(1, 1),
        url: 'https://api.wiro.ai/v1/File/Upload',
      }),
    ).rejects.toThrow('cancelled by test');
    expect(runtime.cancelCount).toBe(1);
    expect(runtime.directoryDeleted).toBe(true);
  });

  it('enforces response limits and removes the temporary file', async () => {
    const runtime = new FakeExpoFileSystem();
    runtime.responseBody = '€€';
    const transport = runtime.transport();

    await expect(
      transport.upload({
        contentLength: 1,
        fileName: 'response.bin',
        headers: {},
        maxResponseBodyBytes: 5,
        stream: generatedBytes(1, 1),
        url: 'https://api.wiro.ai/v1/File/Upload',
      }),
    ).rejects.toThrow(WiroValidationError);
    expect(runtime.directoryDeleted).toBe(true);
  });

  it('cancels in-flight work when disposed', async () => {
    const runtime = new FakeExpoFileSystem();
    runtime.keepUploadPending = true;
    const transport = runtime.transport();
    const pending = transport.upload({
      contentLength: 1,
      fileName: 'dispose.bin',
      headers: {},
      maxResponseBodyBytes: 1_024,
      stream: generatedBytes(1, 1),
      url: 'https://api.wiro.ai/v1/File/Upload',
    });

    await runtime.uploadStartedPromise;
    transport.dispose();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(runtime.cancelCount).toBe(1);
    await expect(
      transport.upload({
        contentLength: 0,
        fileName: 'closed.bin',
        headers: {},
        maxResponseBodyBytes: 1_024,
        stream: generatedBytes(0, 1),
        url: 'https://api.wiro.ai/v1/File/Upload',
      }),
    ).rejects.toThrow('Stream upload transport is disposed.');
  });
});

class FakeExpoFileSystem {
  cancelCount = 0;
  directoryDeleted = false;
  fileName: string | undefined;
  framingText = '';
  keepUploadPending = false;
  maximumWriteBytes = 0;
  responseBody = '{"result":true}';
  totalWritten = 0;
  uploadOptions: Record<string, unknown> | undefined;
  uploadStarted = false;
  readonly uploadStartedPromise: Promise<void>;
  readonly #onUploadStart: (() => void) | undefined;
  #resolveUploadStarted: (() => void) | undefined;
  #resolveUpload: ((value: FakeUploadResult | undefined) => void) | undefined;

  constructor(onUploadStart?: () => void) {
    this.#onUploadStart = onUploadStart;
    this.uploadStartedPromise = new Promise((resolve) => {
      this.#resolveUploadStarted = resolve;
    });
  }

  transport(): WiroStreamUploadTransportImpl {
    return new WiroStreamUploadTransportImpl(() => [
      this.fileSystemModule(),
      this.legacyModule(),
    ]);
  }

  private fileSystemModule(): object {
    const runtime = this;
    class Directory {
      readonly uri = 'file:///cache/wirokit-test';
      exists = true;

      create(): void {}

      delete(): void {
        this.exists = false;
        runtime.directoryDeleted = true;
      }
    }
    class File {
      readonly uri: string;

      constructor(_directory: Directory, fileName: string) {
        runtime.fileName = fileName;
        this.uri = `file:///cache/wirokit-test/${fileName}`;
      }

      create(): void {}

      open(): {
        close(): void;
        writeBytes(bytes: Uint8Array): void;
      } {
        return {
          close() {},
          writeBytes(bytes) {
            runtime.totalWritten += bytes.byteLength;
            if (bytes.byteLength < 1_024) {
              runtime.framingText += String.fromCharCode(...bytes);
            }
            runtime.maximumWriteBytes = Math.max(
              runtime.maximumWriteBytes,
              bytes.byteLength,
            );
          },
        };
      }
    }
    return {
      Directory,
      File,
      Paths: { cache: new Directory() },
    };
  }

  private legacyModule(): object {
    const runtime = this;
    return {
      FileSystemSessionType: { FOREGROUND: 1 },
      FileSystemUploadType: { BINARY_CONTENT: 0 },
      createUploadTask(
        _url: string,
        _fileUri: string,
        options: Record<string, unknown>,
        onProgress?: (progress: {
          totalBytesExpectedToSend: number;
          totalBytesSent: number;
        }) => void,
      ) {
        runtime.uploadOptions = options;
        return {
          async cancelAsync() {
            runtime.cancelCount += 1;
            runtime.#resolveUpload?.(undefined);
          },
          async uploadAsync(): Promise<FakeUploadResult | undefined> {
            runtime.uploadStarted = true;
            runtime.#resolveUploadStarted?.();
            onProgress?.({
              totalBytesExpectedToSend: runtime.totalWritten,
              totalBytesSent: runtime.totalWritten,
            });
            if (
              runtime.keepUploadPending ||
              runtime.#onUploadStart !== undefined
            ) {
              const pending = new Promise<FakeUploadResult | undefined>(
                (resolve) => {
                  runtime.#resolveUpload = resolve;
                },
              );
              runtime.#onUploadStart?.();
              return await pending;
            }
            return {
              body: runtime.responseBody,
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            };
          },
        };
      },
    };
  }
}

interface FakeUploadResult {
  readonly body: string;
  readonly headers: Record<string, string>;
  readonly status: number;
}

async function* generatedBytes(
  totalBytes: number,
  chunkBytes: number,
): AsyncGenerator<Uint8Array> {
  let offset = 0;
  while (offset < totalBytes) {
    const length = Math.min(chunkBytes, totalBytes - offset);
    offset += length;
    yield new Uint8Array(length);
  }
}
