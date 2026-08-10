# WiroKit React Native

Pure TypeScript Wiro SDK for React Native, with an Expo Go example app.

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

Run the example with `pnpm --filter @wiro-ai/example start`.

The SDK is under active development. The initial public API currently exposes
package version information.
