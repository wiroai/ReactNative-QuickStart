# @wiro-ai/wirokit-react-native

Pure TypeScript Wiro SDK for React Native and Expo Go on iOS and Android.

## Installation

```sh
pnpm add @wiro-ai/wirokit-react-native
```

## Current API

```ts
import {
  stringifyWiroJson,
  Wiro,
  WiroClient,
  WiroFileInput,
  WiroKitInfo,
  WiroModelId,
  WiroModelSort,
  WiroValue,
} from '@wiro-ai/wirokit-react-native';

console.log(WiroKitInfo.version);

const modelId = new WiroModelId('owner', 'project');
const input = {
  model: WiroValue.string(modelId.slug),
  seed: WiroValue.numberLexeme('12345678901234567890'),
};

console.log(stringifyWiroJson(input));

const client = new WiroClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret', // Omit for API-key auth.
});

// Proxy mode keeps long-lived Wiro credentials out of shipped apps.
const proxyClient = new WiroClient({
  proxyUrl: 'https://your-proxy.example.com/wiro',
  headers: { Authorization: 'Bearer short-lived-token' },
});

const models = await proxyClient.searchModels({
  search: 'image',
  sort: WiroModelSort.relevance,
});
const schema = await proxyClient.getModelSchema(
  new WiroModelId('owner', 'project'),
);
console.log(models.total, schema.parameters);

const run = await proxyClient.run(
  Wiro.model('owner/project', {
    prompt: WiroValue.string('A mountain lake'),
  }),
  { callbackUrl: 'https://example.com/wiro/callback' },
);
if (run.taskToken !== undefined) {
  const task = await proxyClient.getTask(run.taskToken);
  console.log(task.status.apiValue, task.isSuccessful);
}

// Pass a URI returned by Expo DocumentPicker or ImagePicker. Android
// content:// and iOS file:// values are sent with React Native FormData.
const image = WiroFileInput.uri(pickerAsset.uri, {
  fileName: pickerAsset.name ?? 'image.jpg',
  mediaType: pickerAsset.mimeType ?? 'image/jpeg',
  sizeBytes: pickerAsset.size,
});
const uploadRun = await proxyClient.run(
  Wiro.model('owner/project', {
    image: WiroValue.fileInput(image),
  }),
);

client.close();
proxyClient.close();
```

Core identifiers, lossless JSON values, Expo-compatible file inputs, retry
configuration, limits, logging, typed errors, and the injectable `fetch`
transport are available. Authenticated requests support API-key, signature,
and proxy modes. Model search, explore, schema decoding, forward-compatible
parameter kinds, and schema validation are included. Production mobile apps
should prefer proxy mode instead of embedding long-lived API secrets. Dynamic
model runs and task detail, cancel, and kill operations use typed identifiers
and preserve unknown task statuses for forward compatibility. Multipart
uploads support `Uint8Array`, `Blob`, remote URL, and Expo picker URI inputs.
Nested file inputs are uploaded before `/Run` and replaced with hosted URL
strings.

This package does not use custom native modules and does not depend on React UI
or Expo UI packages. HMAC-SHA256 uses the audited, zero-dependency
`@noble/hashes` JavaScript implementation and does not require native crypto or
random-number APIs.

## Uploads on Expo

Use `uploadFile(bytesOrBlob, fileName)` for buffered data and
`uploadFileFromUri(uri, options)` for an Expo picker URI. URI inputs use React
Native's native `FormData` integration: the native networking stack reads
`file://` or `content://` content and generates the multipart boundary. The SDK
does not copy URI file bytes into the JavaScript heap and does not create
temporary files, so there are no SDK temporary resources to clean up after
success, error, timeout, or abort.

Buffered `Uint8Array` and `Blob` uploads are assembled in JavaScript and are
limited by `WiroClientLimits.maxInMemoryUploadBytes` (16 MiB by default).
Prefer picker URIs for large mobile files. Upload requests use field `file`,
part type `application/octet-stream`, never use the JSON content type, and are
never retried automatically. Upload progress callbacks are not currently
available. Pass an `AbortSignal` to cancel.

`WiroFileContentSource` is injectable through the client constructor,
`runModel`, or upload methods. Tests and non-Expo platforms can return
`WiroBytesFileContent`; the default Expo source preserves picker URIs for
native `FormData`.

## React Native networking note

The SDK sends `User-Agent: WiroKit-ReactNative/0.1.0`. React Native's native
network stack can replace this header, especially with iOS `NSURLSession` or
remote JavaScript debugging. Expo Go cannot install the native
`RCTSetCustomNSURLSessionConfigurationProvider` override, so the header is
best-effort in Expo Go. Authentication does not depend on `User-Agent`.
