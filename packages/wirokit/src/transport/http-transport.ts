import {
  WiroError,
  WiroNetworkError,
  WiroValidationError,
} from '../errors/wiro-error';
import { createAbortError, isAbortError } from '../internal/runtime';
import { utf8ByteLength } from '../internal/utf8';

export interface WiroHttpRequestOptions {
  readonly body?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly maxResponseBodyBytes: number;
  readonly method: 'POST';
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly url: string;
}

export class WiroHttpRequest {
  readonly body: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly maxResponseBodyBytes: number;
  readonly method: 'POST';
  readonly signal: AbortSignal | undefined;
  readonly timeoutMs: number;
  readonly url: string;

  constructor(options: WiroHttpRequestOptions) {
    this.body = options.body;
    this.headers = immutableHeaders(options.headers ?? {});
    this.maxResponseBodyBytes = options.maxResponseBodyBytes;
    this.method = options.method;
    this.signal = options.signal;
    this.timeoutMs = options.timeoutMs;
    this.url = options.url;
    Object.freeze(this);
  }
}

export interface WiroHttpResponseOptions {
  readonly body: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly statusCode: number;
}

export class WiroHttpResponse {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly statusCode: number;

  constructor(options: WiroHttpResponseOptions) {
    this.body = options.body;
    this.headers = immutableHeaders(options.headers ?? {});
    this.statusCode = options.statusCode;
    Object.freeze(this);
  }

  header(name: string): string | undefined {
    const target = name.toLowerCase();
    return Object.entries(this.headers).find(
      ([headerName]) => headerName.toLowerCase() === target,
    )?.[1];
  }
}

export interface WiroHttpTransport {
  perform(request: WiroHttpRequest): Promise<WiroHttpResponse>;
  dispose(): void;
}

export interface FetchWiroHttpTransportOptions {
  readonly fetchImplementation?: typeof fetch;
}

export class FetchWiroHttpTransport implements WiroHttpTransport {
  readonly #fetch: typeof fetch;
  readonly #inFlight = new Set<AbortController>();
  #disposed = false;

  constructor(options: FetchWiroHttpTransportOptions = {}) {
    this.#fetch = options.fetchImplementation ?? globalThis.fetch;
    if (typeof this.#fetch !== 'function') {
      throw new WiroValidationError('A fetch implementation is required.');
    }
  }

  async perform(request: WiroHttpRequest): Promise<WiroHttpResponse> {
    if (this.#disposed) {
      throw new WiroValidationError('HTTP transport is disposed.');
    }
    if (request.signal?.aborted === true) {
      throw request.signal.reason ?? createAbortError();
    }

    const controller = new AbortController();
    const abort = (): void => {
      controller.abort(request.signal?.reason ?? createAbortError());
    };
    request.signal?.addEventListener('abort', abort, {
      once: true,
    });
    this.#inFlight.add(controller);

    try {
      const response = await this.#fetch(request.url, {
        ...(request.body === undefined ? {} : { body: request.body }),
        headers: request.headers,
        method: request.method,
        signal: controller.signal,
      });
      const declaredLength = Number(response.headers.get('Content-Length'));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > request.maxResponseBodyBytes
      ) {
        throw new WiroValidationError(
          'Response body exceeds the configured REST payload limit.',
        );
      }

      const body = await response.text();
      if (utf8ByteLength(body) > request.maxResponseBodyBytes) {
        throw new WiroValidationError(
          'Response body exceeds the configured REST payload limit.',
        );
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name] = value;
      });
      return new WiroHttpResponse({
        body,
        headers,
        statusCode: response.status,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? createAbortError();
      }
      if (error instanceof WiroError || isAbortError(error)) {
        throw error;
      }
      throw new WiroNetworkError(
        'The network request failed.',
        errorTypeName(error),
      );
    } finally {
      this.#inFlight.delete(controller);
      request.signal?.removeEventListener('abort', abort);
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const controller of this.#inFlight) {
      controller.abort(createAbortError());
    }
    this.#inFlight.clear();
  }
}

function immutableHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze({ ...headers });
}

function errorTypeName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error';
}
