# @wiro-ai/wirokit-react-native

Type-safe Wiro SDK for React Native and Expo Go on iOS and Android.

## Installation

```sh
npm install @wiro-ai/wirokit-react-native
```

```sh
yarn add @wiro-ai/wirokit-react-native
```

```sh
pnpm add @wiro-ai/wirokit-react-native
```

The package is pure TypeScript and requires no autolinking, CocoaPods,
Gradle, TurboModule, Fabric, or codegen configuration. The same package works
in Expo Go and bare React Native applications.

## Quick start

```ts
import {
  Wiro,
  WiroClient,
  WiroFlux2ProOutputFormat,
} from '@wiro-ai/wirokit-react-native';

const client = new WiroClient({ apiKey: 'your-api-key' });

try {
  const result = await client.subscribe(
    Wiro.flux2Pro({
      outputFormat: WiroFlux2ProOutputFormat.png,
      prompt: 'A cinematic mountain lake at sunrise',
    }),
    {
      onUpdate(update) {
        console.log(update.status?.apiValue);
      },
    },
  );

  for (const output of result.task.outputs) {
    console.log(output.url?.toString());
  }
} finally {
  client.close();
}
```

The package supports:

- Model search, exploration, and schema discovery
- Typed and dynamic model requests
- Polling and WebSocket task tracking
- Task lookup, cancellation, and termination
- Byte, Blob, stream, and Expo picker URI uploads
- API-key, signature, and proxy authentication
- Typed errors, retry policies, request limits, and structured logging

## Authentication

For local development, create a client with an API key:

```ts
const client = new WiroClient({
  apiKey: 'your-api-key',
});
```

Production mobile applications should keep long-lived credentials on a
trusted backend. Proxy mode sends requests through that backend:

```ts
const client = new WiroClient({
  proxyUrl: 'https://api.example.com/wiro',
  headers: {
    Authorization: 'Bearer short-lived-session-token',
  },
});
```

`baseUrl` and `proxyUrl` require HTTPS, and `socketUrl` requires WSS.
Insecure HTTP and WebSocket URLs are accepted only for loopback hosts such as
`localhost`, which supports local development.

Do not log `task.raw`, `result.raw`, token `rawValue` fields, or
`error.rawResponseBody`; those diagnostic surfaces can contain API data.
Serialize model objects with `JSON.stringify(...)` to use their redacted
representations.

## Typed model requests

Use the `Wiro` factories for compile-time checked request parameters:

```ts
import {
  Wiro,
  WiroGptImage2Quality,
  WiroGptImage2Ratio,
  WiroGptImage2Resolution,
} from '@wiro-ai/wirokit-react-native';

const result = await client.subscribe(
  Wiro.gptImage2({
    prompt: 'A modern cabin beside a frozen lake',
    quality: WiroGptImage2Quality.high,
    ratio: WiroGptImage2Ratio.landscape16x9,
    resolution: WiroGptImage2Resolution.r2k,
    samples: 1,
  }),
);
```

Typed factories are available for:

- FLUX.2 Pro
- GPT Image 2
- Nano Banana Pro
- Seedream v4
- Grok Imagine Image
- Runway Gen-4.5
- Seedance 2.0
- Kling V3
- Veo 3.1
- Sora 2 Pro
- Hailuo 2.3 Fast
- Grok Imagine Video
- Lyria 3

Models without a typed factory can be called with `Wiro.model`:

```ts
const request = Wiro.model('owner/project', {
  prompt: WiroValue.string('A cinematic mountain lake'),
});

const result = await client.subscribe(request);
```

## Discovery

```ts
const models = await client.searchModels({
  search: 'image',
  sort: WiroModelSort.relevance,
});

const schema = await client.getModelSchema(new WiroModelId('owner', 'project'));

console.log(models.total, schema.parameters);
```

## File inputs

Local file inputs are uploaded automatically before a model runs:

```ts
const image = WiroFileInput.uri(pickerAsset.uri, {
  fileName: pickerAsset.name ?? 'image.jpg',
  mediaType: pickerAsset.mimeType ?? 'image/jpeg',
  sizeBytes: pickerAsset.size,
});

const result = await client.subscribe(
  Wiro.model('owner/project', {
    image: WiroValue.fileInput(image),
  }),
);
```

Available upload methods:

- `uploadFile(bytesOrBlob, fileName)`
- `uploadStream(stream, fileName, { contentLength })`
- `uploadFileFromUri(uri, options)`

Byte, Blob, and stream uploads are limited by
`WiroClientLimits.maxInMemoryUploadBytes`, which defaults to 16 MiB. Expo
picker URIs use native `FormData` and avoid copying the file into the
JavaScript heap.

## Tracking tasks

Polling is the default tracking mode:

```ts
const result = await client.subscribe(request, {
  onUpdate(update) {
    console.log(update.status?.apiValue);
  },
});
```

Use WebSocket tracking for live events:

```ts
const result = await client.subscribe(request, {
  trackingMode: 'webSocket',
});
```

Use `subscribeStream` with `for await` when updates should be consumed as an
async iterable:

```ts
const updates = await client.subscribeStream(request);

for await (const update of updates) {
  console.log(update.status?.apiValue);
}
```

## Low-level requests

`client.postJson(path, body, options)` is available for Wiro endpoints that do
not yet have a dedicated method. The path must be relative to the configured
base URL and must not contain a query string or fragment. Prefer the typed
client methods and `Wiro` request factories whenever possible.

## Cancellation

Every asynchronous operation accepts an `AbortSignal`:

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5_000);

try {
  const result = await client.subscribe(request, {
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
```

Call `client.close()` when the client is no longer needed. Closing the client
aborts its in-flight work.

## Requirements

- React Native 0.76 or newer
- Node.js 22.14.0 or newer for development
