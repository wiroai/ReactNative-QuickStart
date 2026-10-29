import {
  type WiroHttpRequest,
  WiroHttpResponse,
  type WiroHttpTransport,
  WiroNetworkError,
} from '../../src';

type Handler = (
  request: WiroHttpRequest,
) => WiroHttpResponse | Promise<WiroHttpResponse>;

export class FakeHttpTransport implements WiroHttpTransport {
  readonly requests: WiroHttpRequest[] = [];
  readonly #handlers: Handler[] = [];
  disposeCount = 0;

  enqueue(handler: Handler): void {
    this.#handlers.push(handler);
  }

  enqueueJson(
    statusCode: number,
    body: string,
    headers: Readonly<Record<string, string>> = {},
  ): void {
    this.enqueue(
      () =>
        new WiroHttpResponse({
          body,
          headers,
          statusCode,
        }),
    );
  }

  async perform(request: WiroHttpRequest): Promise<WiroHttpResponse> {
    this.requests.push(request);
    const handler = this.#handlers.shift();
    if (handler === undefined) {
      throw new WiroNetworkError('Fake transport has no queued response.');
    }
    return handler(request);
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}
