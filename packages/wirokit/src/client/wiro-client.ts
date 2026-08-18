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
  WiroModelId,
  type WiroTaskId,
  WiroTaskToken,
} from '../core/identifiers';
import {
  WiroBlobFileInput,
  WiroBytesFileInput,
  type WiroFileInput,
  WiroUriFileInput,
} from '../core/file-input';
import {
  WiroArrayValue,
  WiroFileInputValue,
  type WiroJson,
  MAX_WIRO_JSON_DEPTH,
  WiroObjectValue,
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
  WiroWebSocketError,
} from '../errors/wiro-error';
import {
  ExpoWiroFileContentSource,
  WiroBytesFileContent,
  type WiroFileContentSource,
  type WiroReadableFileInput,
} from '../files/file-content-source';
import {
  type MalformedJsonHandler,
  readBoolean,
  readObjects,
} from '../internal/json-reader';
import {
  WiroMultipartBody,
  buildMultipartFilePart,
} from '../internal/multipart-form-data';
import {
  type WiroRuntimeDependencies,
  type WiroRuntimeOverrides,
  createAbortError,
  createRuntimeDependencies,
  isAbortError,
} from '../internal/runtime';
import { redactSensitiveText } from '../internal/redaction';
import { createWiroSignature } from '../internal/signature';
import {
  type WiroByteStream,
  readExactByteStream,
} from '../internal/byte-stream';
import { encodeUtf8, utf8ByteLength } from '../internal/utf8';
import {
  requirePositiveDuration,
  validateBaseUrl,
  validateCallbackUrl,
  validateFileName,
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
import { WiroRunResult, WiroTaskResult } from '../models/run-result';
import { WiroModelSchema } from '../models/schema';
import {
  decodeSocketFrame,
  type WiroSocketEvent,
} from '../models/socket-event';
import { WiroTask } from '../models/task';
import {
  WiroTaskSnapshotUpdate,
  WiroTaskTrackingMode,
  type WiroTaskTrackingMode as WiroTaskTrackingModeType,
  WiroTaskUpdate,
  type WiroTaskUpdate as WiroTaskUpdateType,
  WiroTracking,
} from '../models/task-update';
import { WiroUploadResult } from '../models/upload-result';
import type { WiroModelRequest } from '../requests/model-request';
import {
  FetchWiroHttpTransport,
  WiroHttpRequest,
  type WiroHttpResponse,
  type WiroHttpTransport,
} from '../transport/http-transport';
import { decodeResponseEnvelope } from '../transport/response-envelope';
import {
  ExpoWiroSocketSessionFactory,
  type WiroSocketSession,
  type WiroSocketSessionFactory,
} from '../transport/socket-session';
import { WIROKIT_VERSION } from '../wiro-kit-info';

interface WiroClientCommonOptions {
  readonly closeTransportOnClose?: boolean;
  readonly fileContentSource?: WiroFileContentSource;
  readonly limits?: WiroClientLimits | WiroClientLimitsOptions;
  readonly logger?: WiroLogger;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
  readonly retryPolicy?: WiroRetryPolicy;
  readonly socketUrl?: string;
  readonly socketSessionFactory?: WiroSocketSessionFactory;
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
  readonly contentSource?: WiroFileContentSource;
}

export interface WiroUploadOptions extends WiroDiscoveryRequestOptions {
  readonly contentSource?: WiroFileContentSource;
}

export interface WiroUploadFromUriOptions extends WiroUploadOptions {
  readonly fileName?: string;
  readonly mediaType?: string;
  readonly sizeBytes?: number;
}

export type { WiroByteStream } from '../internal/byte-stream';

export interface WiroUploadStreamOptions extends WiroUploadOptions {
  readonly contentLength: number;
}

export interface WiroWatchTaskOptions extends WiroDiscoveryRequestOptions {
  readonly timeoutMs?: number;
}

export interface WiroSubscribeOptions extends WiroRunModelOptions {
  readonly onUpdate?: (update: WiroTaskUpdateType) => void | Promise<void>;
  readonly timeoutMs?: number;
  readonly trackingMode?: WiroTaskTrackingModeType;
}

export interface WiroSubscribeStreamOptions extends WiroRunModelOptions {
  readonly timeoutMs?: number;
  readonly trackingMode?: WiroTaskTrackingModeType;
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
  readonly fileContentSource: WiroFileContentSource | undefined;
  readonly logger: WiroLogger | undefined;
  readonly ownsTransport: boolean;
  readonly runtime: WiroRuntimeDependencies;
  readonly socketSessionFactory: WiroSocketSessionFactory;
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
      fileContentSource: options.fileContentSource,
      logger: options.logger,
      ownsTransport:
        options.transport === undefined ||
        options.closeTransportOnClose === true,
      runtime: createRuntimeDependencies(internalOptions[RUNTIME_OVERRIDES]),
      socketSessionFactory:
        options.socketSessionFactory ?? new ExpoWiroSocketSessionFactory(),
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

  async uploadFile(
    data: Uint8Array | Blob,
    fileName: string,
    options: WiroUploadOptions = {},
  ): Promise<WiroUploadResult> {
    const input =
      data instanceof Uint8Array
        ? new WiroBytesFileInput(data, fileName)
        : new WiroBlobFileInput(data, fileName);
    return this.uploadFileInput(input, options);
  }

  async uploadStream(
    stream: WiroByteStream,
    fileName: string,
    options: WiroUploadStreamOptions,
  ): Promise<WiroUploadResult> {
    const state = getState(this);
    ensureOpen(state);
    throwIfAborted(options.signal);
    validateFileName(fileName);
    if (
      !Number.isSafeInteger(options.contentLength) ||
      options.contentLength < 0
    ) {
      throw new WiroValidationError('contentLength cannot be negative.');
    }
    if (options.contentLength > this.limits.maxInMemoryUploadBytes) {
      throw new WiroValidationError(
        'In-memory upload exceeds the configured size limit.',
      );
    }
    const bytes = await readExactByteStream(
      stream,
      options.contentLength,
      options.signal,
    );
    return this.uploadFile(bytes, fileName, options);
  }

  async uploadFileFromUri(
    uri: string,
    options: WiroUploadFromUriOptions = {},
  ): Promise<WiroUploadResult> {
    const input = new WiroUriFileInput(uri, {
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
      ...(options.mediaType === undefined
        ? {}
        : { mediaType: options.mediaType }),
      ...(options.sizeBytes === undefined
        ? {}
        : { sizeBytes: options.sizeBytes }),
    });
    return this.uploadFileInput(input, options);
  }

  async uploadFileInput(
    input: WiroReadableFileInput,
    options: WiroUploadOptions = {},
  ): Promise<WiroUploadResult> {
    const state = getState(this);
    ensureOpen(state);
    throwIfAborted(options.signal);
    rejectDeclaredOversize(input, this.limits.maxInMemoryUploadBytes);

    const content =
      input instanceof WiroBytesFileInput
        ? new WiroBytesFileContent(input.bytes, input.fileName)
        : await (
            options.contentSource ??
            state.fileContentSource ??
            new ExpoWiroFileContentSource()
          ).read(input, signalOptions(options.signal));
    throwIfAborted(options.signal);
    const fileName = validateFileName(content.fileName);
    let uploadBody: WiroMultipartBody | FormData;
    if (content.kind === 'bytes') {
      const bytes = content.bytes;
      if (bytes.byteLength > this.limits.maxInMemoryUploadBytes) {
        throw new WiroValidationError(
          'In-memory upload exceeds the configured size limit.',
        );
      }
      uploadBody = buildMultipartFilePart({
        bytes,
        fileName,
      });
    } else {
      uploadBody = createExpoUriFormData(content.uri, fileName);
    }
    const json = await this.sendUpload(uploadBody, options.signal);
    return WiroUploadResult.parse(json, malformedJsonHandler(state));
  }

  async resolveFileInputs(
    parameters: WiroJson,
    options: WiroUploadOptions = {},
  ): Promise<WiroJson> {
    const resolved: Record<string, WiroValue> = {};
    for (const [key, value] of Object.entries(parameters)) {
      resolved[key] = await resolveFileValue(this, value, options);
    }
    return WiroValue.object(resolved).value;
  }

  async runModel(
    modelId: WiroModelId,
    parameters: WiroJson = {},
    options: WiroRunModelOptions = {},
  ): Promise<WiroRunResult> {
    const resolvedParameters = containsFileInput(parameters)
      ? await this.resolveFileInputs(parameters, options)
      : parameters;
    const body: Record<string, WiroValue> = {
      ...resolvedParameters,
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

  watchTask(
    token: WiroTaskToken,
    options: WiroWatchTaskOptions = {},
  ): AsyncIterable<WiroTask> {
    const timeoutMs = trackingTimeout(options.timeoutMs);
    return new SingleConsumerAsyncIterable(() =>
      this.pollTaskSnapshots(token, timeoutMs, options.signal),
    );
  }

  watchTaskSocket(
    token: WiroTaskToken,
    options: WiroWatchTaskOptions = {},
  ): AsyncIterable<WiroSocketEvent> {
    const timeoutMs = trackingTimeout(options.timeoutMs);
    return new SingleConsumerAsyncIterable(() =>
      this.runSocketSession(token, timeoutMs, options.signal),
    );
  }

  async waitForTask(
    token: WiroTaskToken,
    options: WiroWatchTaskOptions = {},
  ): Promise<WiroTask> {
    const timeoutMs = trackingTimeout(options.timeoutMs);
    for await (const task of this.pollTaskSnapshots(
      token,
      timeoutMs,
      options.signal,
    )) {
      if (task.status.isTerminal) {
        return task;
      }
    }
    throw new WiroTimeoutError(trackingTimeoutMessage(timeoutMs), timeoutMs);
  }

  subscribe(
    modelId: WiroModelId,
    parameters?: WiroJson,
    options?: WiroSubscribeOptions,
  ): Promise<WiroTaskResult>;

  subscribe(
    request: WiroModelRequest,
    options?: WiroSubscribeOptions,
  ): Promise<WiroTaskResult>;

  async subscribe(
    modelOrRequest: WiroModelId | WiroModelRequest,
    parametersOrOptions: WiroJson | WiroSubscribeOptions = {},
    modelOptions: WiroSubscribeOptions = {},
  ): Promise<WiroTaskResult> {
    const invocation = subscriptionInvocation(
      modelOrRequest,
      parametersOrOptions,
      modelOptions,
    );
    const timeoutMs = trackingTimeout(invocation.options.timeoutMs);
    validateTrackingMode(invocation.options.trackingMode);
    const token = await this.startTrackedRun(
      invocation.modelId,
      invocation.parameters,
      invocation.options,
    );
    const updates =
      invocation.options.trackingMode === WiroTaskTrackingMode.webSocket
        ? this.trackTaskWithSocketUpdates(
            token,
            timeoutMs,
            invocation.options.signal,
          )
        : this.pollTaskUpdates(token, timeoutMs, invocation.options.signal);
    for await (const update of updates) {
      await invocation.options.onUpdate?.(update);
      if (
        update instanceof WiroTaskSnapshotUpdate &&
        update.task.status.isTerminal
      ) {
        return WiroTaskResult.from(update.task);
      }
    }
    throw new WiroTimeoutError(trackingTimeoutMessage(timeoutMs), timeoutMs);
  }

  subscribeStream(
    modelId: WiroModelId,
    parameters?: WiroJson,
    options?: WiroSubscribeStreamOptions,
  ): Promise<AsyncIterable<WiroTaskUpdateType>>;

  subscribeStream(
    request: WiroModelRequest,
    options?: WiroSubscribeStreamOptions,
  ): Promise<AsyncIterable<WiroTaskUpdateType>>;

  async subscribeStream(
    modelOrRequest: WiroModelId | WiroModelRequest,
    parametersOrOptions: WiroJson | WiroSubscribeStreamOptions = {},
    modelOptions: WiroSubscribeStreamOptions = {},
  ): Promise<AsyncIterable<WiroTaskUpdateType>> {
    const invocation = subscriptionInvocation(
      modelOrRequest,
      parametersOrOptions,
      modelOptions,
    );
    const timeoutMs = trackingTimeout(invocation.options.timeoutMs);
    validateTrackingMode(invocation.options.trackingMode);
    const token = await this.startTrackedRun(
      invocation.modelId,
      invocation.parameters,
      invocation.options,
    );
    return new ReusableAsyncIterable(() =>
      invocation.options.trackingMode === WiroTaskTrackingMode.webSocket
        ? this.trackTaskWithSocketUpdates(
            token,
            timeoutMs,
            invocation.options.signal,
          )
        : this.pollTaskUpdates(token, timeoutMs, invocation.options.signal),
    );
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

  private async startTrackedRun(
    modelId: WiroModelId,
    parameters: WiroJson,
    options: WiroRunModelOptions,
  ): Promise<WiroTaskToken> {
    const run = await this.runModel(modelId, parameters, options);
    if (run.taskToken === undefined) {
      throw new WiroUnknownApiError(
        'The model run response did not contain a task token.',
        { statusCode: 200 },
      );
    }
    return run.taskToken;
  }

  private async *pollTaskUpdates(
    token: WiroTaskToken,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<WiroTaskUpdateType, void, void> {
    for await (const task of this.pollTaskSnapshots(token, timeoutMs, signal)) {
      yield WiroTaskUpdate.snapshot(task);
    }
  }

  private async *trackTaskWithSocketUpdates(
    token: WiroTaskToken,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<WiroTaskUpdateType, void, void> {
    const state = getState(this);
    const started = state.runtime.monotonicClock.milliseconds();
    try {
      for await (const event of this.runSocketSession(
        token,
        timeoutMs,
        signal,
      )) {
        yield WiroTaskUpdate.fromSocketEvent(event);
      }
    } catch (error) {
      if (isAbortError(error) || error instanceof WiroTimeoutError) {
        throw error;
      }
      if (!(error instanceof WiroWebSocketError)) {
        throw error;
      }
    }

    throwIfAborted(signal);
    const task = await this.getTask(token, signalOptions(signal));
    if (task.status.isTerminal) {
      yield WiroTaskUpdate.snapshot(task);
      return;
    }
    const remainingMs = timeoutMs - trackingElapsed(state, started);
    if (remainingMs <= 0) {
      throw new WiroTimeoutError(trackingTimeoutMessage(timeoutMs), timeoutMs);
    }
    for await (const update of this.pollTaskUpdates(
      token,
      remainingMs,
      signal,
    )) {
      yield update;
    }
  }

  private async *runSocketSession(
    token: WiroTaskToken,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<WiroSocketEvent, void, void> {
    const state = getState(this);
    ensureOpen(state);
    const scope = createTrackingScope(state, signal);
    let session: WiroSocketSession | undefined;
    try {
      try {
        session = await state.socketSessionFactory.connect(this.socketUrl, {
          maxBinaryBytes: this.limits.maxWebSocketBinaryBytes,
          maxQueuedBytes:
            this.limits.maxWebSocketTextBytes +
            this.limits.maxWebSocketBinaryBytes,
          maxTextBytes: this.limits.maxWebSocketTextBytes,
          signal: scope.signal,
          timeoutMs: this.requestTimeoutMs,
        });
      } catch (error) {
        rethrowSocketControlError(error, scope.signal);
        throw socketFailure(error);
      }
      try {
        await session.sendText(taskInfoHandshakeJson(token));
      } catch (error) {
        rethrowSocketControlError(error, scope.signal);
        if (error instanceof WiroWebSocketError) {
          throw error;
        }
        throw new WiroWebSocketError(
          'Failed to send a WebSocket frame.',
          errorTypeName(error),
        );
      }

      const started = state.runtime.monotonicClock.milliseconds();
      while (trackingElapsed(state, started) < timeoutMs) {
        throwIfAborted(scope.signal);
        const remainingMs = timeoutMs - trackingElapsed(state, started);
        const frame = await receiveSocketFrameBefore(
          state,
          session,
          remainingMs,
          timeoutMs,
          scope.signal,
        );
        const event = decodeSocketFrame(frame, {
          maxBinaryBytes: this.limits.maxWebSocketBinaryBytes,
          maxTextBytes: this.limits.maxWebSocketTextBytes,
        });
        yield event;
        if (event.isTerminal) {
          return;
        }
      }
      throw new WiroTimeoutError(socketTimeoutMessage(timeoutMs), timeoutMs);
    } catch (error) {
      rethrowSocketControlError(error, scope.signal);
      if (
        error instanceof WiroWebSocketError ||
        error instanceof WiroTimeoutError
      ) {
        throw error;
      }
      throw socketFailure(error);
    } finally {
      try {
        await session?.close();
      } catch {
        // Best-effort cleanup must not replace the tracking result.
      } finally {
        scope.dispose();
      }
    }
  }

  private async *pollTaskSnapshots(
    token: WiroTaskToken,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<WiroTask, void, void> {
    const state = getState(this);
    ensureOpen(state);
    const scope = createTrackingScope(state, signal);
    const started = state.runtime.monotonicClock.milliseconds();
    try {
      while (trackingElapsed(state, started) < timeoutMs) {
        ensureOpen(state);
        throwIfAborted(scope.signal);
        const task = await this.getTask(token, signalOptions(scope.signal));
        yield task;
        if (task.status.isTerminal) {
          return;
        }
        throwIfAborted(scope.signal);
        const remainingMs = timeoutMs - trackingElapsed(state, started);
        if (remainingMs <= 0) {
          break;
        }
        await state.runtime.delay.sleep(
          Math.min(remainingMs, this.pollIntervalMs),
          scope.signal,
        );
        throwIfAborted(scope.signal);
      }
      throw new WiroTimeoutError(trackingTimeoutMessage(timeoutMs), timeoutMs);
    } finally {
      scope.dispose();
    }
  }

  private async sendUpload(
    uploadBody: WiroMultipartBody | FormData,
    signal: AbortSignal | undefined,
  ): Promise<WiroJson> {
    const state = getState(this);
    ensureOpen(state);
    throwIfAborted(signal);
    const url = makeRequestUrl(this.baseUrl, '/File/Upload');
    const headers = buildAuthHeaders(
      state.auth,
      state.runtime,
      uploadBody instanceof WiroMultipartBody ? uploadBody.contentType : null,
    );
    const sensitiveValues = collectSensitiveValues(state.auth, headers);
    const started = state.runtime.clock.epochMilliseconds();
    logEvent(
      state,
      new WiroLogEvent({
        level: WiroLogLevel.debug,
        message: 'Starting request.',
        method: 'POST',
        retryCount: 0,
        url,
      }),
    );

    let response: WiroHttpResponse;
    try {
      response = await performAttempt(
        state,
        new WiroHttpRequest({
          ...(uploadBody instanceof WiroMultipartBody
            ? { binaryBody: uploadBody.body }
            : { formDataBody: uploadBody }),
          headers,
          maxResponseBodyBytes: this.limits.maxRestBodyBytes,
          method: 'POST',
          timeoutMs: this.requestTimeoutMs,
          url,
        }),
        signal,
        this.requestTimeoutMs,
      );
    } catch (error) {
      rethrowIfRequestAborted(signal, error);
      const mapped = mapTransportError(error);
      logFailure(state, mapped, url, 0);
      throw mapped;
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
        retryCount: 0,
        statusCode: response.statusCode,
        url,
      }),
    );
    if (utf8ByteLength(response.body) > this.limits.maxRestBodyBytes) {
      const error = new WiroValidationError(
        'Response body exceeds the configured REST payload limit.',
      );
      logFailure(state, error, url, 0);
      throw error;
    }

    try {
      throwIfAborted(signal);
      return decodeResponseEnvelope(response, (message) =>
        redactSensitiveText(message, sensitiveValues),
      );
    } catch (error) {
      rethrowIfRequestAborted(signal, error);
      if (error instanceof WiroError) {
        logFailure(state, error, url, 0);
      }
      throw error;
    }
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
        rethrowIfRequestAborted(options.signal, error);
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
        rethrowIfRequestAborted(options.signal, error);
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

export function taskInfoHandshakeJson(token: WiroTaskToken): string {
  const escaped = token.rawValue.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
  return `{"type":"task_info","tasktoken":"${escaped}"}`;
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
  contentType: string | null = 'application/json',
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
  if (contentType !== null) {
    headers['Content-Type'] = contentType;
  }
  return Object.freeze(headers);
}

function isSdkOwnedHeader(name: string): boolean {
  const lowered = name.toLowerCase();
  return lowered === 'user-agent' || lowered === 'content-type';
}

function makeRequestUrl(baseUrl: string, path: string): string {
  validatePublicRequestPath(path);
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

function validatePublicRequestPath(path: string): void {
  if (
    path.includes('?') ||
    path.includes('#') ||
    /[\r\n\u0000\\]/u.test(path)
  ) {
    throw new WiroValidationError(
      `Could not build request URL for path ${path}.`,
    );
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  for (const segment of normalizedPath.split('/')) {
    if (segment.length === 0) {
      continue;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new WiroValidationError(
        `Could not build request URL for path ${path}.`,
      );
    }
    if (
      segment === '.' ||
      segment === '..' ||
      decoded === '.' ||
      decoded === '..' ||
      /[\r\n\u0000\\]/u.test(decoded)
    ) {
      throw new WiroValidationError(
        `Could not build request URL for path ${path}.`,
      );
    }
  }
}

function encodeRequestBody(body: WiroJson, maximumBytes: number): string {
  let encoded: string;
  try {
    encoded = stringifyWiroJson(body);
  } catch (error) {
    if (error instanceof WiroValidationError) {
      throw error;
    }
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
  const timeoutError = new WiroTimeoutError(
    `The network request timed out after ${timeoutMs} ms.`,
    timeoutMs,
  );
  const timeout = setTimeout(() => {
    controller.abort(timeoutError);
  }, timeoutMs);

  try {
    const operation = state.transport.perform(
      new WiroHttpRequest({
        ...(request.binaryBody === undefined
          ? {}
          : { binaryBody: request.binaryBody }),
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.formDataBody === undefined
          ? {}
          : { formDataBody: request.formDataBody }),
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

interface SubscriptionInvocation {
  readonly modelId: WiroModelId;
  readonly options: WiroSubscribeOptions;
  readonly parameters: WiroJson;
}

interface TrackingScope {
  readonly dispose: () => void;
  readonly signal: AbortSignal;
}

class SingleConsumerAsyncIterable<T> implements AsyncIterable<T> {
  readonly #factory: () => AsyncIterator<T>;
  #consumed = false;

  constructor(factory: () => AsyncIterator<T>) {
    this.#factory = factory;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.#consumed) {
      throw new WiroValidationError(
        'This task watch can only be consumed once.',
      );
    }
    this.#consumed = true;
    return this.#factory();
  }
}

class ReusableAsyncIterable<T> implements AsyncIterable<T> {
  readonly #factory: () => AsyncIterator<T>;

  constructor(factory: () => AsyncIterator<T>) {
    this.#factory = factory;
    Object.freeze(this);
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.#factory();
  }
}

function subscriptionInvocation(
  modelOrRequest: WiroModelId | WiroModelRequest,
  parametersOrOptions: WiroJson | WiroSubscribeOptions,
  modelOptions: WiroSubscribeOptions,
): SubscriptionInvocation {
  if (modelOrRequest instanceof WiroModelId) {
    return {
      modelId: modelOrRequest,
      options: modelOptions,
      parameters: parametersOrOptions as WiroJson,
    };
  }
  return {
    modelId: modelOrRequest.model,
    options: parametersOrOptions as WiroSubscribeOptions,
    parameters: modelOrRequest.parameters(),
  };
}

function trackingTimeout(timeoutMs: number | undefined): number {
  return requirePositiveDuration(
    timeoutMs ?? WiroTracking.defaultTimeoutMs,
    'timeout',
  );
}

function validateTrackingMode(
  mode: WiroTaskTrackingModeType | undefined,
): void {
  if (
    mode !== undefined &&
    mode !== WiroTaskTrackingMode.polling &&
    mode !== WiroTaskTrackingMode.webSocket
  ) {
    throw new WiroValidationError('trackingMode must be polling or webSocket.');
  }
}

function createTrackingScope(
  state: ClientState,
  externalSignal: AbortSignal | undefined,
): TrackingScope {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort(externalSignal?.reason ?? createAbortError());
  };
  if (externalSignal?.aborted === true) {
    abort();
  } else {
    externalSignal?.addEventListener('abort', abort, {
      once: true,
    });
  }
  state.controllers.add(controller);
  return {
    dispose(): void {
      externalSignal?.removeEventListener('abort', abort);
      state.controllers.delete(controller);
      if (!controller.signal.aborted) {
        controller.abort(createAbortError());
      }
    },
    signal: controller.signal,
  };
}

function trackingElapsed(state: ClientState, startedMs: number): number {
  return state.runtime.monotonicClock.milliseconds() - startedMs;
}

function trackingTimeoutMessage(timeoutMs: number): string {
  return `Task did not finish within ${timeoutMs} ms.`;
}

function socketTimeoutMessage(timeoutMs: number): string {
  return `Task socket did not finish within ${timeoutMs} ms.`;
}

async function receiveSocketFrameBefore(
  state: ClientState,
  session: WiroSocketSession,
  remainingMs: number,
  timeoutMs: number,
  signal: AbortSignal,
) {
  if (remainingMs <= 0) {
    await session.close();
    throw new WiroTimeoutError(socketTimeoutMessage(timeoutMs), timeoutMs);
  }
  const timeoutController = new AbortController();
  const receive = session.receiveFrame(signal);
  const timeout = state.runtime.delay
    .sleep(remainingMs, timeoutController.signal)
    .then(async () => {
      await session.close();
      throw new WiroTimeoutError(socketTimeoutMessage(timeoutMs), timeoutMs);
    });
  try {
    return await Promise.race([receive, timeout]);
  } finally {
    timeoutController.abort(createAbortError());
    void timeout.catch(() => undefined);
  }
}

function rethrowSocketControlError(error: unknown, signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError();
  }
  if (isAbortError(error)) {
    throw error;
  }
}

function socketFailure(error: unknown): WiroWebSocketError {
  return new WiroWebSocketError(
    'The Wiro task WebSocket failed.',
    errorTypeName(error),
  );
}

function errorTypeName(error: unknown): string {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error';
}

function containsFileInput(value: WiroJson): boolean {
  return Object.values(value).some(containsFileInputValue);
}

function containsFileInputValue(value: WiroValue): boolean {
  if (value instanceof WiroFileInputValue) {
    return true;
  }
  if (value instanceof WiroObjectValue) {
    return Object.values(value.value).some(containsFileInputValue);
  }
  if (value instanceof WiroArrayValue) {
    return value.value.some(containsFileInputValue);
  }
  return false;
}

async function resolveFileValue(
  client: WiroClient,
  value: WiroValue,
  options: WiroUploadOptions,
  depth = 0,
): Promise<WiroValue> {
  if (depth > MAX_WIRO_JSON_DEPTH) {
    throw new WiroValidationError(
      'JSON value exceeds the maximum nesting depth.',
    );
  }
  if (value instanceof WiroFileInputValue) {
    return resolveFileInput(client, value.value, options);
  }
  if (value instanceof WiroObjectValue) {
    const resolved: Record<string, WiroValue> = {};
    for (const [key, nested] of Object.entries(value.value)) {
      resolved[key] = await resolveFileValue(
        client,
        nested,
        options,
        depth + 1,
      );
    }
    return WiroValue.object(resolved);
  }
  if (value instanceof WiroArrayValue) {
    const resolved: WiroValue[] = [];
    for (const nested of value.value) {
      resolved.push(await resolveFileValue(client, nested, options, depth + 1));
    }
    return WiroValue.array(resolved);
  }
  return value;
}

async function resolveFileInput(
  client: WiroClient,
  input: WiroFileInput,
  options: WiroUploadOptions,
): Promise<WiroValue> {
  if (input.kind === 'url') {
    return WiroValue.string(input.wireValue);
  }
  const result = await client.uploadFileInput(input, options);
  const url = result.files[0]?.url;
  if (url === undefined) {
    throw new WiroUnknownApiError(
      `The upload for "${fileInputName(input)}" ` +
        'did not return a file URL.',
      { statusCode: 200 },
    );
  }
  return WiroValue.string(url.toString());
}

function fileInputName(input: WiroReadableFileInput): string {
  return input instanceof WiroUriFileInput
    ? (input.fileName ?? 'upload.bin')
    : input.fileName;
}

function createExpoUriFormData(uri: string, fileName: string): FormData {
  if (typeof FormData !== 'function') {
    throw new WiroValidationError('FormData is required for URI file inputs.');
  }
  const formData = new FormData();
  const part = {
    name: fileName,
    type: 'application/octet-stream',
    uri,
  };
  formData.append('file', part as unknown as Blob);
  return formData;
}

function rejectDeclaredOversize(
  input: WiroReadableFileInput,
  maximumBytes: number,
): void {
  const size =
    input instanceof WiroBytesFileInput
      ? input.bytes.byteLength
      : input instanceof WiroBlobFileInput
        ? input.blob.size
        : undefined;
  if (size !== undefined && size > maximumBytes) {
    throw new WiroValidationError(
      'In-memory upload exceeds the configured size limit.',
    );
  }
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

function rethrowIfRequestAborted(
  signal: AbortSignal | undefined,
  error: unknown,
): void {
  if (signal?.aborted === true) {
    throw signal.reason ?? createAbortError();
  }
  if (isAbortError(error)) {
    throw error;
  }
}

function getState(client: WiroClient): ClientState {
  const state = CLIENT_STATES.get(client);
  if (state === undefined) {
    throw new WiroValidationError('Invalid WiroClient instance.');
  }
  return state;
}
