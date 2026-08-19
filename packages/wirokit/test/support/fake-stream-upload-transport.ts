import {
  type WiroStreamUploadRequest,
  type WiroStreamUploadTransport,
  WiroHttpResponse,
  WiroNetworkError,
} from '../../src';

type Handler = (
  request: WiroStreamUploadRequest,
) => WiroHttpResponse | Promise<WiroHttpResponse>;

export class FakeStreamUploadTransport implements WiroStreamUploadTransport {
  readonly requests: WiroStreamUploadRequest[] = [];
  readonly #handlers: Handler[] = [];
  disposeCount = 0;

  enqueue(handler: Handler): void {
    this.#handlers.push(handler);
  }

  enqueueJson(statusCode: number, body: string): void {
    this.enqueue(
      () =>
        new WiroHttpResponse({
          body,
          statusCode,
        }),
    );
  }

  async upload(request: WiroStreamUploadRequest): Promise<WiroHttpResponse> {
    this.requests.push(request);
    const handler = this.#handlers.shift();
    if (handler === undefined) {
      throw new WiroNetworkError(
        'Fake stream transport has no queued response.',
      );
    }
    return handler(request);
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}
