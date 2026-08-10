import {
  WIROKIT_VERSION,
  WiroClient,
  WiroFileInput,
  type WiroFileInput as WiroFileInputType,
  WiroKitInfo,
  WiroModelId,
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

void version;
void infoVersion;
void modelId;
void value;
void error;
void client;
