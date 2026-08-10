import {
  WIROKIT_VERSION,
  WiroFileInput,
  type WiroFileInput as WiroFileInputType,
  WiroKitInfo,
  WiroModelId,
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

void version;
void infoVersion;
void modelId;
void value;
void error;
