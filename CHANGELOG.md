# Changelog

## 0.1.0 - 2026-10-29

- First release on npm as `@wiro-ai/wiro-react-native` (developed as
  `@wiro-ai/wirokit-react-native`). `WIROKIT_VERSION` and `WiroKitInfo` are now
  `WIRO_SDK_VERSION` and `WiroSdkInfo`, and the User-Agent is
  `wiro-react-native/<version>`.

- Add the typed Wiro client for React Native and Expo Go.
- Cover discovery, run, subscribe, polling, WebSocket tracking, and uploads.
- Ship 13 typed model factories plus dynamic `Wiro.model`.
- Add `uploadStream` support for large `AsyncIterable` and `ReadableStream`
  byte sources without loading the full file into memory.
