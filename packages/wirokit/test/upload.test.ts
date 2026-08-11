import { describe, expect, it, vi } from 'vitest';

import {
  ExpoWiroFileContentSource,
  WiroBytesFileContent,
  WiroClient,
  WiroClientLimits,
  type WiroFileContent,
  type WiroFileContentSource,
  WiroFileInput,
  WiroModelId,
  type WiroReadableFileInput,
  WiroRetryPolicy,
  WiroUnknownApiError,
  WiroUploadResult,
  WiroValue,
} from '../src';
import { FakeHttpTransport } from './support/fake-http-transport';

function client(
  transport: FakeHttpTransport,
  options: {
    readonly contentSource?: WiroFileContentSource;
    readonly limits?: WiroClientLimits;
    readonly retryPolicy?: WiroRetryPolicy;
  } = {},
): WiroClient {
  return new WiroClient({
    apiKey: 'test-api-key',
    ...(options.contentSource === undefined
      ? {}
      : { fileContentSource: options.contentSource }),
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    retryPolicy: options.retryPolicy ?? WiroRetryPolicy.none,
    transport,
  });
}

describe('WiroClient uploads', () => {
  it('sends multipart bytes and parses uploaded files', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, uploadResponse('https://cdn.wiro.ai/photo.png'));

    const result = await client(transport).uploadFile(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'photo.png',
    );

    const request = transport.requests[0];
    expect(request?.url).toBe('https://api.wiro.ai/v1/File/Upload');
    expect(request?.headers).toMatchObject({
      'User-Agent': 'WiroKit-ReactNative/0.1.0',
      'x-api-key': 'test-api-key',
    });
    expect(request?.headers['Content-Type']).toMatch(
      /^multipart\/form-data; boundary=Boundary-[0-9a-f]{32}$/u,
    );
    expect(request?.headers['Content-Type']).not.toBe('application/json');
    expect(request?.body).toBeUndefined();
    expect(request?.binaryBody).toBeInstanceOf(Uint8Array);
    expect(asAscii(request?.binaryBody)).toContain(
      'name="file"; filename="photo.png"',
    );
    expect(asAscii(request?.binaryBody)).toContain(
      'Content-Type: application/octet-stream',
    );
    expect(result.isSuccess).toBe(true);
    expect(result.files[0]).toMatchObject({
      contentType: 'image/png',
      id: 'file-1',
      name: 'photo.png',
      size: 4,
    });
    expect(result.files[0]?.url?.toString()).toBe(
      'https://cdn.wiro.ai/photo.png',
    );
  });

  it('never retries upload failures', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(503, '{"message":"busy"}');
    transport.enqueueJson(
      200,
      uploadResponse('https://cdn.wiro.ai/unexpected'),
    );

    await expect(
      client(transport, {
        retryPolicy: WiroRetryPolicy.default,
      }).uploadFile(new Uint8Array([1]), 'file.bin'),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(transport.requests).toHaveLength(1);
  });

  it('enforces the in-memory upload limit before transport', async () => {
    const transport = new FakeHttpTransport();
    const sdk = client(transport, {
      limits: new WiroClientLimits({
        maxInMemoryUploadBytes: 3,
      }),
    });

    await expect(
      sdk.uploadFile(new Uint8Array([1, 2, 3, 4]), 'file.bin'),
    ).rejects.toThrow('In-memory upload exceeds the configured size limit.');
    expect(transport.requests).toHaveLength(0);
  });

  it('uploads Blob inputs through the bounded content source', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, uploadResponse('https://cdn.wiro.ai/blob.bin'));

    const result = await client(transport).uploadFile(
      new Blob([new Uint8Array([1, 2, 3])]),
      'blob.bin',
    );

    expect(result.files[0]?.url?.pathname).toBe('/blob.bin');
    expect(asAscii(transport.requests[0]?.binaryBody)).toContain(
      '\u0001\u0002\u0003',
    );
  });

  it('uses native FormData for Expo picker URIs', async () => {
    class FakeNativeFormData {
      readonly parts: unknown[][] = [];

      append(...part: unknown[]): void {
        this.parts.push(part);
      }
    }
    vi.stubGlobal('FormData', FakeNativeFormData);
    const transport = new FakeHttpTransport();
    transport.enqueueJson(
      200,
      uploadResponse('https://cdn.wiro.ai/picker.jpg'),
    );

    try {
      await client(transport).uploadFileFromUri('content://picker/private-id', {
        fileName: 'picker.jpg',
        mediaType: 'image/jpeg',
        sizeBytes: 4,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    const request = transport.requests[0];
    const formData = request?.formDataBody as unknown as FakeNativeFormData;
    expect(request?.binaryBody).toBeUndefined();
    expect(request?.headers['Content-Type']).toBeUndefined();
    expect(formData.parts).toEqual([
      [
        'file',
        {
          name: 'picker.jpg',
          type: 'application/octet-stream',
          uri: 'content://picker/private-id',
        },
      ],
    ]);
  });

  it('returns native URI content without buffering it in JS', async () => {
    const source = new ExpoWiroFileContentSource();
    const content = await source.read(
      WiroFileInput.uri('file:///private/image.jpg', {
        fileName: 'image.jpg',
      }),
    );

    expect(content).toMatchObject({
      fileName: 'image.jpg',
      kind: 'expoUri',
      uri: 'file:///private/image.jpg',
    });
  });

  it('reads bytes defensively through the default source', async () => {
    const source = new ExpoWiroFileContentSource();
    const input = WiroFileInput.bytes(new Uint8Array([1, 2]), 'file.bin');

    const content = await source.read(input);
    expect(content).toBeInstanceOf(WiroBytesFileContent);
    if (content.kind === 'bytes') {
      const exposed = content.bytes;
      exposed[0] = 9;
      expect(content.bytes).toEqual(new Uint8Array([1, 2]));
    }
  });

  it('uses upload.bin when picker metadata has no filename', async () => {
    const content = await new ExpoWiroFileContentSource().read(
      WiroFileInput.uri('content://picker/without-name'),
    );

    expect(content.fileName).toBe('upload.bin');
  });

  it('maps unreadable Blob content to validation', async () => {
    class FailingBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.reject(new Error('private details'));
      }

      override slice(): Blob {
        return this;
      }
    }
    const source = new ExpoWiroFileContentSource();

    await expect(
      source.read(WiroFileInput.blob(new FailingBlob(['data']), 'file.bin')),
    ).rejects.toThrow('The Blob content could not be read.');
  });

  it('preserves AbortError raised while reading a Blob', async () => {
    class AbortingBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }

      override slice(): Blob {
        return this;
      }
    }

    await expect(
      new ExpoWiroFileContentSource().read(
        WiroFileInput.blob(new AbortingBlob(['data']), 'file.bin'),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves an abort reason raised during Blob reading', async () => {
    const controller = new AbortController();
    const reason = new Error('stopped');
    class CancellingBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        controller.abort(reason);
        return Promise.reject(new Error('read failed'));
      }

      override slice(): Blob {
        return this;
      }
    }

    await expect(
      new ExpoWiroFileContentSource().read(
        WiroFileInput.blob(new CancellingBlob(['data']), 'file.bin'),
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason);
  });

  it('preserves AbortError before URI resolution', async () => {
    const controller = new AbortController();
    controller.abort();
    const source = new ExpoWiroFileContentSource();

    await expect(
      source.read(WiroFileInput.uri('file:///private/image.jpg'), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('requires FormData only for native URI uploads', async () => {
    vi.stubGlobal('FormData', undefined);
    try {
      await expect(
        client(new FakeHttpTransport()).uploadFileFromUri('file:///image.jpg'),
      ).rejects.toThrow('FormData is required for URI file inputs.');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('WiroUploadResult', () => {
  it('decodes sparse responses with immutable empty defaults', () => {
    const result = WiroUploadResult.parse({});

    expect(result).toMatchObject({
      errors: [],
      files: [],
      isSuccess: false,
    });
  });
});

describe('recursive file-input resolution', () => {
  it('resolves deep bytes and passes remote URLs through', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, uploadResponse('https://cdn.wiro.ai/first.bin'));
    transport.enqueueJson(
      200,
      uploadResponse('https://cdn.wiro.ai/second.bin'),
    );
    transport.enqueueJson(200, '{"result":true,"taskid":"task-1"}');
    const parameters = {
      nested: WiroValue.array([
        WiroValue.fileInput(
          WiroFileInput.bytes(new Uint8Array([1]), 'first.bin'),
        ),
        WiroValue.object({
          remote: WiroValue.fileInput(
            WiroFileInput.url('https://example.com/reference.png?x=1'),
          ),
          second: WiroValue.fileInput(
            WiroFileInput.bytes(new Uint8Array([2]), 'second.bin'),
          ),
        }),
      ]),
    };

    await client(transport).runModel(
      new WiroModelId('owner', 'project'),
      parameters,
    );

    expect(transport.requests.map((request) => request.url)).toEqual([
      'https://api.wiro.ai/v1/File/Upload',
      'https://api.wiro.ai/v1/File/Upload',
      'https://api.wiro.ai/v1/Run/owner/project',
    ]);
    expect(JSON.parse(transport.requests[2]?.body ?? '')).toEqual({
      nested: [
        'https://cdn.wiro.ai/first.bin',
        {
          remote: 'https://example.com/reference.png?x=1',
          second: 'https://cdn.wiro.ai/second.bin',
        },
      ],
    });
  });

  it('resolves URI occurrences sequentially', async () => {
    const calls: string[] = [];
    const source: WiroFileContentSource = {
      async read(input: WiroReadableFileInput): Promise<WiroFileContent> {
        calls.push(input.kind);
        return new WiroBytesFileContent(
          new Uint8Array([calls.length]),
          input.fileName ?? 'upload.bin',
        );
      },
    };
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, uploadResponse('https://cdn.wiro.ai/one'));
    transport.enqueueJson(200, uploadResponse('https://cdn.wiro.ai/two'));

    const resolved = await client(transport, {
      contentSource: source,
    }).resolveFileInputs({
      files: WiroValue.array([
        WiroValue.fileInput(
          WiroFileInput.uri('file:///one', {
            fileName: 'one.bin',
          }),
        ),
        WiroValue.fileInput(
          WiroFileInput.uri('content://two', {
            fileName: 'two.bin',
          }),
        ),
      ]),
    });

    expect(calls).toEqual(['uri', 'uri']);
    expect(transport.requests).toHaveLength(2);
    expect(resolved.files).toEqual(
      WiroValue.array([
        WiroValue.string('https://cdn.wiro.ai/one'),
        WiroValue.string('https://cdn.wiro.ai/two'),
      ]),
    );
  });

  it('does not upload when parameters contain no local files', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');

    await client(transport).runModel(new WiroModelId('owner', 'project'), {
      prompt: WiroValue.string('hello'),
    });

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toContain('/Run/owner/project');
  });

  it('stops before Run when upload response has no URL', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true,"list":[{"id":"missing"}]}');
    const sdk = client(transport);

    const error = await sdk
      .runModel(new WiroModelId('owner', 'project'), {
        image: WiroValue.fileInput(
          WiroFileInput.bytes(new Uint8Array([1]), 'private.bin'),
        ),
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WiroUnknownApiError);
    expect(error).toMatchObject({
      message: 'The upload for "private.bin" did not return a file URL.',
      statusCode: 200,
    });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toContain('/File/Upload');
  });
});

function uploadResponse(url: string): string {
  return JSON.stringify({
    list: [
      {
        contenttype: 'image/png',
        id: 'file-1',
        name: 'photo.png',
        size: '4',
        url,
      },
    ],
    result: true,
  });
}

function asAscii(body: string | Uint8Array | Blob | undefined): string {
  return body instanceof Uint8Array ? String.fromCharCode(...body) : '';
}
