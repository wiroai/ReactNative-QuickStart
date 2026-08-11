import {
  WIROKIT_VERSION,
  Wiro,
  WiroClient,
  WiroFileInput,
  type WiroFileInput as WiroFileInputType,
  WiroKitInfo,
  type WiroModel,
  WiroModelId,
  type WiroModelSchema,
  WiroModelSort,
  type WiroPaginatedResult,
  type WiroRunResult,
  type WiroTask,
  WiroTaskId,
  WiroTaskStatus,
  WiroHttpResponse,
  type WiroHttpTransport,
  WiroValidationError,
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
