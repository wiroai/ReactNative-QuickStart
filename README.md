# WiroKit React Native

Type-safe Wiro SDK for React Native and Expo Go on iOS and Android.

The SDK is implemented entirely in TypeScript. It has no native module,
autolinking, CocoaPods, Gradle, TurboModule, Fabric, or codegen setup.

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

See the [package guide](packages/wirokit/README.md) for authentication,
typed model requests, uploads, task tracking, and cancellation.

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

  console.log(result.task.outputs);
} finally {
  client.close();
}
```

Production mobile applications should keep long-lived credentials on a
trusted backend and use `WiroClient` proxy mode.

## Workspace

- `packages/wirokit`: publishable `@wiro-ai/wirokit-react-native` package
- `apps/example`: Expo Go-compatible iOS and Android example

## Development

```sh
corepack enable
pnpm install
pnpm build
pnpm test
```

Run the example with `pnpm --filter @wiro-ai/example start`. Copy
`.env.example` to `.env` and set `EXPO_PUBLIC_WIRO_API_KEY` for a local
FLUX.2 Pro generation. Values prefixed with `EXPO_PUBLIC_` are embedded in the
client bundle and must not contain production credentials.

## Project documents

- [Changelog](CHANGELOG.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [MIT License](LICENSE)
