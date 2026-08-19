<div align="center">

<img src="https://wiro.ai/images/logos/logo/logo.png" alt="Wiro" width="180" />

# WiroKit for React Native

**Official React Native / Expo SDK for discovering and running AI models on [Wiro](https://wiro.ai)**

[![CI](https://img.shields.io/github/actions/workflow/status/wiroai/ReactNative-QuickStart/ci.yml?style=for-the-badge&label=CI)](https://github.com/wiroai/ReactNative-QuickStart/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@wiro-ai/wirokit-react-native?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/@wiro-ai/wirokit-react-native)
[![React Native](https://img.shields.io/badge/React%20Native-0.76%2B-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://reactnative.dev)
[![Expo](https://img.shields.io/badge/Expo-Go-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev)
[![MIT](https://img.shields.io/badge/license-MIT-6f42c1?style=for-the-badge)](LICENSE)

[Docs](https://wiro.ai/docs) · [Models](https://wiro.ai/models) · [Dashboard](https://wiro.ai/panel) · [Create Project](https://wiro.ai/panel/project/new)

</div>

## Features

- Typed request factories for popular image, video, and audio models
- Dynamic model requests with `Wiro.model("owner/project", parameters)`
- Model search, explore, and schema validation
- `subscribe` / `run` / `subscribeStream` task lifecycle APIs
- Automatic uploads for bytes, Blob, stream, and Expo picker URIs
- Polling and WebSocket task tracking
- Task cancel / kill
- Retry with exponential backoff, timeouts, and structured logging
- API key, HMAC signature, and proxy authentication
- AbortSignal cancellation and `client.close()` lifecycle control

## Requirements

- React Native 0.76+
- Expo SDK 54+ (Expo Go supported)
- `expo-file-system` peer dependency
- Node.js 22.14+ for development
- A [Wiro project and API key](https://wiro.ai/panel/project/new)

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

```sh
npx expo install expo-file-system
```

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
      prompt: 'A cinematic mountain lake',
    }),
  );

  if (result.kind === 'success') {
    console.log(result.task.outputs[0]?.url?.toString());
  } else {
    console.log('Failed:', result.reason);
  }
} finally {
  client.close();
}
```

> **Mobile tip:** Prefer `WiroClient({ proxyUrl, headers })` in shipped apps so
> long-lived API secrets never ship inside the binary.

## Authentication

### API key

```ts
const client = new WiroClient({ apiKey: 'your-api-key' });
```

### API key + HMAC signature

```ts
const client = new WiroClient({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
});
```

### Proxy (recommended for production)

```ts
const client = new WiroClient({
  proxyUrl: 'https://api.myapp.com/wiro/v1',
  headers: {
    Authorization: 'Bearer app-token',
  },
});
```

Your backend attaches Wiro credentials server-side. The SDK never stores an
API key in proxy mode.

## Which call do I need?

| I want to… | Call |
| --- | --- |
| Generate with a supported model | `client.subscribe(Wiro.flux2Pro(...))` |
| Run any other model | `client.subscribe(Wiro.model("owner/project", …))` |
| Fire-and-forget then wait | `run` / `runModel`, then `waitForTask` |
| Stream live status updates | `subscribeStream(...)` |
| Find a model | `searchModels` / `explore` |
| Inspect parameters | `getModelSchema`, then `schema.validate` |
| Send bytes / Blob | `WiroFileInput.bytes(...)` / `.blob(...)` |
| Send an Expo picker URI | `WiroFileInput.uri(...)` |
| Stop work | `AbortSignal`, or `cancelTask` / `killTask` |

## Typed and dynamic requests

| Category | Models |
| --- | --- |
| Image | FLUX.2 Pro, GPT Image 2, Nano Banana Pro, Seedream v4, Grok Imagine Image |
| Video | Runway Gen-4.5, Seedance 2.0, Kling V3, Veo 3.1, Sora 2 Pro, Hailuo 2.3 Fast, Grok Imagine Video |
| Music | Lyria 3 |

```ts
import {
  Wiro,
  WiroFlux2ProOutputFormat,
  WiroValue,
} from '@wiro-ai/wirokit-react-native';

// Typed
const request = Wiro.flux2Pro({
  prompt: 'Sunset over the bay',
  outputFormat: WiroFlux2ProOutputFormat.png,
});

// Dynamic
const dynamic = Wiro.model('black-forest-labs/flux-2-pro', {
  prompt: WiroValue.string('Sunset over the bay'),
  width: WiroValue.number(1024),
  height: WiroValue.number(1024),
});
```

## Polling and WebSocket tracking

```ts
// Default: polling
const result = await client.subscribe(request, {
  onUpdate(update) {
    console.log(update.status?.apiValue);
  },
});

// WebSocket
const live = await client.subscribe(request, {
  trackingMode: 'webSocket',
});

// Async iterable
const updates = await client.subscribeStream(request);
for await (const update of updates) {
  console.log(update.status?.apiValue);
}
```

## Uploads

Unresolved file inputs inside run parameters are uploaded automatically before
`/Run`.

```ts
const image = WiroFileInput.uri(pickerAsset.uri, {
  fileName: pickerAsset.name ?? 'photo.jpg',
  mediaType: pickerAsset.mimeType ?? 'image/jpeg',
  sizeBytes: pickerAsset.size,
});

const result = await client.subscribe(
  Wiro.model('owner/project', {
    image: WiroValue.fileInput(image),
  }),
);
```

Manual upload helpers:

```ts
await client.uploadFile(bytesOrBlob, 'photo.png');
await client.uploadFileFromUri(uri, { fileName: 'photo.png' });
await client.uploadStream(stream, 'video.mp4', { contentLength });
```

## Cancellation

```ts
const controller = new AbortController();

const result = await client.subscribe(request, {
  signal: controller.signal,
});

controller.abort();
client.close();
```

## Security guidance

- Prefer proxy mode in production builds.
- Never log API keys, secrets, proxy bearer tokens, or raw response bodies.
- Prefer `JSON.stringify(...)` on SDK objects; diagnostic fields such as
  `task.raw` and `error.rawResponseBody` are for local debugging only.
- Do not put production credentials in `EXPO_PUBLIC_*` environment variables.

## Workspace

- `packages/wirokit`: publishable `@wiro-ai/wirokit-react-native` package
- `apps/example`: Expo Go-compatible iOS and Android example

Package reference: [`packages/wirokit/README.md`](packages/wirokit/README.md)

## Example app

```sh
corepack enable
pnpm install
pnpm --filter @wiro-ai/example start
```

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_WIRO_API_KEY` for local
development.

## Documentation

- Product docs: [https://wiro.ai/docs](https://wiro.ai/docs)
- Available models: [https://wiro.ai/models](https://wiro.ai/models)
- Package guide: [`packages/wirokit/README.md`](packages/wirokit/README.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Security policy: [`SECURITY.md`](SECURITY.md)
- Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Development

```sh
corepack enable
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:coverage
pnpm verify:exports
```

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

<img src="https://wiro.ai/images/koala/accent-heavy-koala.png" alt="Wiro" width="80" />

**Built with 💚 by the Wiro team**

[wiro.ai](https://wiro.ai) · [GitHub @wiroai](https://github.com/wiroai)

</div>
