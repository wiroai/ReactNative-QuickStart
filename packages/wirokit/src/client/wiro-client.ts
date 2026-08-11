import { WiroAuthType, WiroClientDefaults } from '../config/auth';
import {
  WiroClientLimits,
  type WiroClientLimitsOptions,
} from '../config/client-limits';
import {
  type WiroModelSort,
  WiroModelSort as WiroModelSortValue,
  type WiroSortOrder,
} from '../config/discovery';
import { WiroRetryPolicy } from '../config/retry-policy';
import {
  type WiroModelId,
  type WiroTaskId,
  WiroTaskToken,
} from '../core/identifiers';
import {
  type WiroJson,
  WiroValue,
  stringifyWiroJson,
} from '../core/wiro-value';
import {
  WiroError,
  WiroNetworkError,
  WiroRateLimitError,
  WiroTimeoutError,
  WiroUnknownApiError,
  WiroValidationError,
} from '../errors/wiro-error';
import {
  type MalformedJsonHandler,
  readBoolean,
  readObjects,
} from '../internal/json-reader';
import {
  type WiroRuntimeDependencies,
  type WiroRuntimeOverrides,
  createAbortError,
  createRuntimeDependencies,
  isAbortError,
} from '../internal/runtime';
import { redactSensitiveText } from '../internal/redaction';
import { createWiroSignature } from '../internal/signature';
import { encodeUtf8, utf8ByteLength } from '../internal/utf8';
import {
  requirePositiveDuration,
  validateBaseUrl,
  validateCallbackUrl,
  validateHeader,
  validateWebSocketUrl,
} from '../internal/validation';
import {
  type WiroLogger,
  WiroLogEvent,
  WiroLogLevel,
} from '../logging/wiro-logging';
import { WiroExploreCategory } from '../models/explore';
import { WiroModel } from '../models/model';
import { WiroPaginatedResult } from '../models/pagination';
import { WiroRunResult } from '../models/run-result';
import { WiroModelSchema } from '../models/schema';
import { WiroTask } from '../models/task';
import type { WiroModelRequest } from '../requests/model-request';
import {
  FetchWiroHttpTransport,
  WiroHttpRequest,
  type WiroHttpResponse,
  type WiroHttpTransport,
} from '../transport/http-transport';
import { decodeResponseEnvelope } from '../transport/response-envelope';
import { WIROKIT_VERSION } from '../wiro-kit-info';

interface WiroClientCommonOptions {
  readonly closeTransportOnClose?: boolean;
  readonly limits?: WiroClientLimits | WiroClientLimitsOptions;
  readonly logger?: WiroLogger;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly retryPolicy?: WiroRetryPolicy;
  readonly socketUrl?: string;
  readonly transport?: WiroHttpTransport;
}

export interface WiroApiKeyClientOptions extends WiroClientCommonOptions {
  readonly apiKey: string;
  readonly apiSecret?: string;
  readonly baseUrl?: string;
  readonly headers?: never;
  readonly proxyUrl?: never;
}

export interface WiroProxyClientOptions extends WiroClientCommonOptions {
  readonly apiKey?: never;
  readonly apiSecret?: never;
  readonly baseUrl?: never;
  readonly headers?: Readonly<Record<string, string>>;
  readonly proxyUrl: string;
}

export type WiroClientOptions =
  WiroApiKeyClientOptions | WiroProxyClientOptions;

export interface WiroPostJsonOptions {
  readonly retryable?: boolean;
  readonly signal?: AbortSignal;
}

export interface WiroDiscoveryRequestOptions {
  readonly signal?: AbortSignal;
}

export interface WiroSearchModelsOptions extends WiroDiscoveryRequestOptions {
  readonly categories?: readonly string[];
  readonly limit?: number;
  readonly order?: WiroSortOrder | null;
  readonly owner?: string | null;
  readonly search?: string;
  readonly sort?: WiroModelSort;
  readonly start?: number;
}

export interface WiroRunModelOptions extends WiroDiscoveryRequestOptions {
  readonly callbackUrl?: string | null;
}

interface ApiKeyAuth {
  readonly apiKey: string;
  readonly type: typeof WiroAuthType.apiKey;
}

interface SignatureAuth {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly type: typeof WiroAuthType.signature;
}

interface ProxyAuth {
  readonly headers: Readonly<Record<string, string>>;
  readonly type: typeof WiroAuthType.proxy;
}

type ClientAuth = ApiKeyAuth | SignatureAuth | ProxyAuth;

interface ClientState {
  readonly auth: ClientAuth;
  readonly controllers: Set<AbortController>;
  readonly logger: WiroLogger | undefined;
  readonly ownsTransport: boolean;
  readonly runtime: WiroRuntimeDependencies;
  readonly transport: WiroHttpTransport;
  closed: boolean;
}

const CLIENT_STATES = new WeakMap<WiroClient, ClientState>();
const RUNTIME_OVERRIDES = Symbol('WiroRuntimeOverrides');

type InternalClientOptions = WiroClientOptions & {
  readonly [RUNTIME_OVERRIDES]?: WiroRuntimeOverrides;
};

export class WiroClient {
  readonly authType: WiroAuthType;
  readonly baseUrl: string;
  readonly limits: WiroClientLimits;
  readonly pollIntervalMs: number;
  readonly requestTimeoutMs: number;
  readonly retryPolicy: WiroRetryPolicy;
  readonly socketUrl: string;

  constructor(options: WiroClientOptions) {
    const internalOptions = options as InternalClientOptions;
    const auth = resolveAuth(options);
    const transport = options.transport ?? new FetchWiroHttpTransport();

    this.authType = auth.type;
    this.baseUrl = validateBaseUrl(
      'proxyUrl' in options
        ? options.proxyUrl
        : (options.baseUrl ?? WiroClientDefaults.restBaseUrl),
    );
    this.socketUrl = validateWebSocketUrl(
      options.socketUrl ?? WiroClientDefaults.webSocketUrl,
    );
    this.pollIntervalMs = requirePositiveDuration(
      options.pollIntervalMs ?? WiroClientDefaults.pollIntervalMs,
      'pollInterval',
    );
    this.requestTimeoutMs = requirePositiveDuration(
      options.requestTimeoutMs ?? WiroClientDefaults.requestTimeoutMs,
      'requestTimeout',
    );
    this.retryPolicy = options.retryPolicy ?? WiroRetryPolicy.default;
    this.limits =
      options.limits instanceof WiroClientLimits
        ? options.limits
        : new WiroClientLimits(options.limits);

    CLIENT_STATES.set(this, {
      auth,
      closed: false,
      controllers: new Set(),
      logger: options.logger,
      ownsTransport:
        options.transport === undefined ||
        options.closeTransportOnClose === true,
      runtime: createRuntimeDependencies(internalOptions[RUNTIME_OVERRIDES]),
      transport,
    });
    Object.freeze(this);
  }

  get isClosed(): boolean {
    return getState(this).closed;
  }

  async searchModels(
    options: WiroSearchModelsOptions = {},
  ): Promise<WiroPaginatedResult<WiroModel>> {
    const start = options.start ?? 0;
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(start) || start < 0) {
      throw new WiroValidationError('start cannot be negative.');
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new WiroValidationError('limit must be between 1 and 100.');
    }

    const body: Record<string, WiroValue> = {
      categories: WiroValue.array(
        (options.categories ?? []).map(WiroValue.string),
      ),
      hideworkflows: WiroValue.boolean(true),
      limit: WiroValue.string(String(limit)),
      search: WiroValue.string(options.search ?? ''),
      sort: WiroValue.string(options.sort ?? WiroModelSortValue.relevance),
      start: WiroValue.string(String(start)),
      summary: WiroValue.boolean(true),
    };
    if (options.owner != null) {
      body.slugowner = WiroValue.string(options.owner);
    }
    if (options.order != null) {
      body.order = WiroValue.string(options.order);
    }

    const json = await this.postJson(
      '/Tool/List',
      body,
      signalOptions(options.signal),
    );
    const onMalformedJson = malformedJsonHandler(getState(this));
    return WiroPaginatedResult.parse(
      json,
      'tool',
      (item) => WiroModel.parse(item, onMalformedJson),
      onMalformedJson,
    );
  }

  async explore(
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<readonly WiroExploreCategory[]> {
    const json = await this.postJson(
      '/Tool/Explore',
      {},
      signalOptions(options.signal),
    );
    const onMalformedJson = malformedJsonHandler(getState(this));
    return Object.freeze(
      readObjects(json.explore, onMalformedJson).map((item) =>
        WiroExploreCategory.parse(item, onMalformedJson),
      ),
    );
  }

  async getModelSchema(
    modelId: WiroModelId,
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<WiroModelSchema> {
    const json = await this.postJson(
      '/Tool/Detail',
      {
        slugowner: WiroValue.string(modelId.owner),
        slugproject: WiroValue.string(modelId.project),
      },
      signalOptions(options.signal),
    );
    const onMalformedJson = malformedJsonHandler(getState(this));
    const model = readObjects(json.tool, onMalformedJson)[0];
    if (model === undefined) {
      throw new WiroUnknownApiError(
        'The model schema response did not contain a model.',
        { statusCode: 200 },
      );
    }
    return WiroModelSchema.parse(model, onMalformedJson);
  }

  async runModel(
    modelId: WiroModelId,
    parameters: WiroJson = {},
    options: WiroRunModelOptions = {},
  ): Promise<WiroRunResult> {
    const body: Record<string, WiroValue> = {
      ...parameters,
    };
    if (options.callbackUrl != null) {
      body.callbackUrl = WiroValue.string(
        validateCallbackUrl(options.callbackUrl),
      );
    }
    const owner = percentEncodePathSegment(modelId.owner);
    const project = percentEncodePathSegment(modelId.project);
    const json = await this.postJson(`/Run/${owner}/${project}`, body, {
      ...signalOptions(options.signal),
      retryable: false,
    });
    return WiroRunResult.parse(json, malformedJsonHandler(getState(this)));
  }

  async run(
    request: WiroModelRequest,
    options: WiroRunModelOptions = {},
  ): Promise<WiroRunResult> {
    return this.runModel(request.model, request.parameters(), options);
  }

  async getTask(
    token: WiroTaskToken,
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<WiroTask> {
    const json = await this.postJson(
      '/Task/Detail',
      {
        tasktoken: WiroValue.string(token.rawValue),
      },
      signalOptions(options.signal),
    );
    return taskFromResponse(json, malformedJsonHandler(getState(this)));
  }

  async getTaskById(
    id: WiroTaskId,
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<WiroTask> {
    const json = await this.postJson(
      '/Task/Detail',
      {
        taskid: WiroValue.string(id.rawValue),
      },
      signalOptions(options.signal),
    );
    return taskFromResponse(json, malformedJsonHandler(getState(this)));
  }

  async cancelTask(
    id: WiroTaskId,
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<boolean> {
    const json = await this.postJson(
      '/Task/Cancel',
      {
        taskid: WiroValue.string(id.rawValue),
      },
      signalOptions(options.signal),
    );
    return readBoolean(json.result) ?? false;
  }

  killTask(
    identifier: WiroTaskToken,
    options?: WiroDiscoveryRequestOptions,
  ): Promise<boolean>;

  killTask(
    identifier: WiroTaskId,
    options?: WiroDiscoveryRequestOptions,
  ): Promise<boolean>;

  async killTask(
    identifier: WiroTaskToken | WiroTaskId,
    options: WiroDiscoveryRequestOptions = {},
  ): Promise<boolean> {
    const isToken = identifier instanceof WiroTaskToken;
    const json = await this.postJson(
      '/Task/Kill',
      {
        [isToken ? 'socketaccesstoken' : 'taskid']: WiroValue.string(
          identifier.rawValue,
        ),
      },
      signalOptions(options.signal),
    );
    return readBoolean(json.result) ?? false;
  }

  async postJson(
    path: string,
    body: WiroJson = {},
    options: WiroPostJsonOptions = {},
  ): Promise<WiroJson> {
    const state = getState(this);
    ensureOpen(state);
    throwIfAborted(options.signal);

    const url = makeRequestUrl(this.baseUrl, path);
    const retryable = (options.retryable ?? true) && isRetryablePath(path);
    const encodedBody = encodeRequestBody(body, this.limits.maxRestBodyBytes);
    let attempt = 0;

    while (true) {
      ensureOpen(state);
      throwIfAborted(options.signal);
      const headers = buildAuthHeaders(state.auth, state.runtime);
      const sensitiveValues = collectSensitiveValues(state.auth, headers);
      const started = state.runtime.clock.epochMilliseconds();

      logEvent(
        state,
        new WiroLogEvent({
          level: WiroLogLevel.debug,
          message: 'Starting request.',
          method: 'POST',
          retryCount: attempt,
          url,
        }),
      );

      let response: WiroHttpResponse;
      try {
        response = await performAttempt(
          state,
          new WiroHttpRequest({
            body: encodedBody,
            headers,
            maxResponseBodyBytes: this.limits.maxRestBodyBytes,
            method: 'POST',
            timeoutMs: this.requestTimeoutMs,
            url,
          }),
          options.signal,
          this.requestTimeoutMs,
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        const mapped = mapTransportError(error);
        const delayMs = retryDelay(
          mapped,
          attempt,
          retryable,
          this.retryPolicy,
          state.runtime,
        );
        if (delayMs === undefined) {
          logFailure(state, mapped, url, attempt);
          throw mapped;
        }
        await waitBeforeRetry(state, mapped, delayMs, attempt, options.signal);
        attempt += 1;
        continue;
      }

      logEvent(
        state,
        new WiroLogEvent({
          durationMs: durationSince(
            state.runtime.clock.epochMilliseconds(),
            started,
          ),
          level: WiroLogLevel.info,
          message: 'Request completed.',
          method: 'POST',
          retryCount: attempt,
          statusCode: response.statusCode,
          url,
        }),
      );

      if (utf8ByteLength(response.body) > this.limits.maxRestBodyBytes) {
        const error = new WiroValidationError(
          'Response body exceeds the configured REST payload limit.',
        );
        logFailure(state, error, url, attempt);
        throw error;
      }

      try {
        throwIfAborted(options.signal);
        return decodeResponseEnvelope(response, (message) =>
          redactSensitiveText(message, sensitiveValues),
        );
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        if (!(error instanceof WiroError)) {
          throw error;
        }
        const delayMs = retryDelay(
          error,
          attempt,
          retryable,
          this.retryPolicy,
          state.runtime,
        );
        if (delayMs === undefined) {
          logFailure(state, error, url, attempt);
          throw error;
        }
        await waitBeforeRetry(state, error, delayMs, attempt, options.signal);
        attempt += 1;
      }
    }
  }

  close(): void {
    const state = getState(this);
    if (state.closed) {
      return;
    }
    state.closed = true;
    for (const controller of state.controllers) {
      controller.abort(createAbortError());
    }
    state.controllers.clear();
    if (state.ownsTransport) {
      state.transport.dispose();
    }
  }
}

export function createWiroClientForTests(
  options: WiroClientOptions,
  runtime: WiroRuntimeOverrides,
): WiroClient {
  const internalOptions = {
    ...options,
    [RUNTIME_OVERRIDES]: runtime,
  } as InternalClientOptions;
  return new WiroClient(internalOptions);
}

export function makeWiroUserAgent(): string {
  return `WiroKit-ReactNative/${WIROKIT_VERSION}`;
}

export function isRetryablePath(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized !== '/File/Upload' && !normalized.startsWith('/Run/');
}

export function percentEncodePathSegment(value: string): string {
  let encoded = '';
  for (const byte of encodeUtf8(value)) {
    if (
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) ||
      byte === 0x2d ||
      byte === 0x2e ||
      byte === 0x5f ||
      byte === 0x7e
    ) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return encoded;
}

function resolveAuth(options: WiroClientOptions): ClientAuth {
  if ('proxyUrl' in options) {
    const headers = Object.freeze({
      ...(options.headers ?? {}),
    });
    for (const [name, value] of Object.entries(headers)) {
      validateHeader(name, value);
    }
    return {
      headers,
      type: WiroAuthType.proxy,
    };
  }

  const apiKey = options.apiKey.trim();
  if (apiKey.length === 0) {
    throw new WiroValidationError('apiKey must be a non-empty string.');
  }
  validateHeader('x-api-key', apiKey);

  if (options.apiSecret === undefined) {
    return {
      apiKey,
      type: WiroAuthType.apiKey,
    };
  }
  const apiSecret = options.apiSecret.trim();
  if (apiSecret.length === 0) {
    throw new WiroValidationError(
      'apiSecret must be a non-empty string when provided.',
    );
  }
  return {
    apiKey,
    apiSecret,
    type: WiroAuthType.signature,
  };
}

function buildAuthHeaders(
  auth: ClientAuth,
  runtime: WiroRuntimeDependencies,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (auth.type === WiroAuthType.apiKey) {
    headers['x-api-key'] = auth.apiKey;
  } else if (auth.type === WiroAuthType.signature) {
    const nonce = runtime.nonceProvider.nextNonce();
    headers['x-api-key'] = auth.apiKey;
    headers['x-nonce'] = nonce;
    headers['x-signature'] = createWiroSignature(
      auth.apiKey,
      auth.apiSecret,
      nonce,
    );
  } else {
    for (const [name, value] of Object.entries(auth.headers)) {
      if (!isSdkOwnedHeader(name)) {
        headers[name] = value;
      }
    }
  }
  headers['User-Agent'] = makeWiroUserAgent();
  headers['Content-Type'] = 'application/json';
  return Object.freeze(headers);
}

function isSdkOwnedHeader(name: string): boolean {
  const lowered = name.toLowerCase();
  return lowered === 'user-agent' || lowered === 'content-type';
}

function makeRequestUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidate = baseUrl + normalizedPath;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    throw new WiroValidationError(
      `Could not build request URL for path ${path}.`,
    );
  }
}

function encodeRequestBody(body: WiroJson, maximumBytes: number): string {
  let encoded: string;
  try {
    encoded = stringifyWiroJson(body);
  } catch {
    throw new WiroValidationError('Could not encode request body as JSON.');
  }
  if (utf8ByteLength(encoded) > maximumBytes) {
    throw new WiroValidationError(
      'Request body exceeds the configured REST payload limit.',
    );
  }
  return encoded;
}

async function performAttempt(
  state: ClientState,
  request: WiroHttpRequest,
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<WiroHttpResponse> {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort(externalSignal?.reason ?? createAbortError());
  };
  externalSignal?.addEventListener('abort', abort, {
    once: true,
  });
  state.controllers.add(controller);
  const timeoutError = new WiroNetworkError(
    'The network request failed.',
    'TimeoutError',
  );
  const timeout = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    const operation = state.transport.perform(
      new WiroHttpRequest({
        ...(request.body === undefined ? {} : { body: request.body }),
        headers: request.headers,
        maxResponseBodyBytes: request.maxResponseBodyBytes,
        method: request.method,
        signal: controller.signal,
        timeoutMs: request.timeoutMs,
        url: request.url,
      }),
    );
    return await rejectOnAbort(operation, controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason ?? createAbortError();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
    state.controllers.delete(controller);
  }
}

function rejectOnAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    void operation.catch(() => undefined);
    return Promise.reject(signal.reason ?? createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      reject(signal.reason ?? createAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function mapTransportError(error: unknown): WiroError {
  if (error instanceof WiroError) {
    return error;
  }
  return new WiroNetworkError(
    'The network request failed.',
    error instanceof Error && error.name.length > 0 ? error.name : 'Error',
  );
}

function retryDelay(
  error: WiroError,
  attempt: number,
  retryable: boolean,
  policy: WiroRetryPolicy,
  runtime: WiroRuntimeDependencies,
): number | undefined {
  if (!retryable || attempt >= policy.maxRetries) {
    return undefined;
  }
  const policyDelay = policy.delayForRetry(
    attempt,
    runtime.jitterProvider.nextFactor(),
  );
  if (error instanceof WiroRateLimitError) {
    return Math.max(policyDelay, error.retryAfterMs ?? 0);
  }
  if (error instanceof WiroUnknownApiError) {
    return error.statusCode !== undefined &&
      policy.shouldRetry(error.statusCode)
      ? policyDelay
      : undefined;
  }
  return error instanceof WiroNetworkError || error instanceof WiroTimeoutError
    ? policyDelay
    : undefined;
}

function signalOptions(signal: AbortSignal | undefined): WiroPostJsonOptions {
  return signal === undefined ? {} : { signal };
}

function malformedJsonHandler(state: ClientState): MalformedJsonHandler {
  return (raw) => {
    logEvent(
      state,
      new WiroLogEvent({
        level: WiroLogLevel.debug,
        message:
          'Ignored malformed nested JSON string ' + `(length ${raw.length}).`,
      }),
    );
  };
}

function taskFromResponse(
  json: WiroJson,
  onMalformedJson: MalformedJsonHandler,
): WiroTask {
  const task = readObjects(json.tasklist, onMalformedJson)[0];
  if (task === undefined) {
    throw new WiroUnknownApiError('The task response did not contain a task.', {
      statusCode: 200,
    });
  }
  return WiroTask.parse(task, onMalformedJson);
}

async function waitBeforeRetry(
  state: ClientState,
  error: WiroError,
  delayMs: number,
  attempt: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  logEvent(
    state,
    new WiroLogEvent({
      error,
      level: WiroLogLevel.warning,
      message: 'Retrying request after transient failure.',
      retryCount: attempt + 1,
    }),
  );
  throwIfAborted(signal);
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort(signal?.reason ?? createAbortError());
  };
  signal?.addEventListener('abort', abort, { once: true });
  state.controllers.add(controller);
  try {
    await rejectOnAbort(
      state.runtime.delay.sleep(delayMs, controller.signal),
      controller.signal,
    );
    throwIfAborted(controller.signal);
    ensureOpen(state);
  } finally {
    signal?.removeEventListener('abort', abort);
    state.controllers.delete(controller);
  }
}

function collectSensitiveValues(
  auth: ClientAuth,
  headers: Readonly<Record<string, string>>,
): readonly string[] {
  const values: string[] =
    auth.type === WiroAuthType.proxy
      ? Object.values(auth.headers)
      : auth.type === WiroAuthType.signature
        ? [auth.apiKey, auth.apiSecret]
        : [auth.apiKey];
  for (const [name, value] of Object.entries(headers)) {
    if (
      [
        'authorization',
        'cookie',
        'proxy-authorization',
        'x-api-key',
        'x-nonce',
        'x-signature',
      ].includes(name.toLowerCase())
    ) {
      values.push(value);
    }
  }
  return Object.freeze(values);
}

function durationSince(current: number, started: number): number {
  return Math.max(current - started, 0);
}

function logFailure(
  state: ClientState,
  error: WiroError,
  url: string,
  attempt: number,
): void {
  logEvent(
    state,
    new WiroLogEvent({
      error,
      level: WiroLogLevel.error,
      message: 'Request failed.',
      retryCount: attempt,
      url,
    }),
  );
}

function logEvent(state: ClientState, event: WiroLogEvent): void {
  state.logger?.log(event);
}

function ensureOpen(state: ClientState): void {
  if (state.closed) {
    throw new WiroValidationError('WiroClient is closed.');
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
}

function getState(client: WiroClient): ClientState {
  const state = CLIENT_STATES.get(client);
  if (state === undefined) {
    throw new WiroValidationError('Invalid WiroClient instance.');
  }
  return state;
}
