import {
  WIROKIT_VERSION,
  WiroBytesFileContent,
  Wiro,
  WiroClient,
  WiroFileInput,
  type WiroFileInput as WiroFileInputType,
  type WiroFileContentSource,
  WiroKitInfo,
  type WiroModel,
  WiroModelId,
  type WiroModelSchema,
  WiroModelSort,
  type WiroPaginatedResult,
  type WiroRunResult,
  type WiroTaskResult,
  type WiroTask,
  WiroTaskId,
  WiroTaskStatus,
  WiroTaskToken,
  type WiroTaskUpdate,
  WiroTracking,
  WiroHttpResponse,
  type WiroHttpTransport,
  WiroValidationError,
  type WiroUploadResult,
  WiroValue,
  type WiroValue as WiroValueType,
} from '@wiro-ai/wirokit-react-native';

const version: '0.1.0' = WIROKIT_VERSION;
const infoVersion: '0.1.0' = WiroKitInfo.version;
const modelId = new WiroModelId('owner', 'project');
const fileInput: WiroFileInputType = WiroFileInput.uri('file:///image.png');
const value: WiroValueType = WiroValue.fileInput(fileInput);
const error: Error = new WiroValidationError('Invalid.');
const transport: WiroHttpTransport = {
  dispose(): void {},
  async perform() {
    return new WiroHttpResponse({
      body: '{}',
      statusCode: 200,
    });
  },
};
const client = new WiroClient({
  apiKey: 'test-api-key',
  transport,
});
const models: Promise<WiroPaginatedResult<WiroModel>> = client.searchModels({
  sort: WiroModelSort.relevance,
});
const schema: Promise<WiroModelSchema> = client.getModelSchema(modelId);
const request = Wiro.model('owner/project', {
  prompt: WiroValue.string('hello'),
});
const run: Promise<WiroRunResult> = client.run(request);
const task: Promise<WiroTask> = client.getTaskById(new WiroTaskId('task-id'));
const terminal: boolean = WiroTaskStatus.completed.isTerminal;
const taskToken = new WiroTaskToken('task-token');
const watch: AsyncIterable<WiroTask> = client.watchTask(taskToken);
const subscription: Promise<WiroTaskResult> = client.subscribe(request);
const subscriptionStream: Promise<AsyncIterable<WiroTaskUpdate>> =
  client.subscribeStream(request, {
    timeoutMs: WiroTracking.defaultTimeoutMs,
  });
const contentSource: WiroFileContentSource = {
  async read(input) {
    return new WiroBytesFileContent(
      new Uint8Array(),
      input.fileName ?? 'upload.bin',
    );
  },
};
const upload: Promise<WiroUploadResult> = client.uploadFileFromUri(
  'file:///image.png',
  { contentSource, fileName: 'image.png' },
);

void version;
void infoVersion;
void modelId;
void value;
void error;
void client;
void models;
void schema;
void request;
void run;
void task;
void terminal;
void watch;
void subscription;
void subscriptionStream;
void upload;
