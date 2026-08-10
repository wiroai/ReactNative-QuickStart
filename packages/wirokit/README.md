# @wiro-ai/wirokit-react-native

Pure TypeScript Wiro SDK for React Native and Expo Go on iOS and Android.

## Installation

```sh
pnpm add @wiro-ai/wirokit-react-native
```

## Current API

```ts
import { WiroKitInfo } from '@wiro-ai/wirokit-react-native';

console.log(WiroKitInfo.version);
```

The client API is being implemented incrementally. This package does not use
custom native modules and does not depend on React UI or Expo UI packages.
