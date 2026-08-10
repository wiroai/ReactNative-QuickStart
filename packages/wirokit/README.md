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
  WiroKitInfo,
  WiroModelId,
  WiroValue,
} from '@wiro-ai/wirokit-react-native';

console.log(WiroKitInfo.version);

const modelId = new WiroModelId('owner', 'project');
const input = {
  model: WiroValue.string(modelId.slug),
  seed: WiroValue.numberLexeme('12345678901234567890'),
};

console.log(stringifyWiroJson(input));
```

Core identifiers, lossless JSON values, Expo-compatible file inputs, retry
configuration, limits, logging, and typed errors are available. The network
client API is being implemented incrementally.

This package does not use custom native modules and does not depend on React UI
or Expo UI packages.
