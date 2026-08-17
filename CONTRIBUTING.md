# Contributing

Thank you for improving the Wiro React Native SDK.

## Requirements

- Node.js 20.19.4 or newer
- pnpm 11.21.0 via Corepack
- Git

## Setup

```sh
git clone https://github.com/wiroai/ReactNative-QuickStart.git
cd ReactNative-QuickStart
corepack enable
pnpm install
```

## Development checks

Run these checks before opening a pull request:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm verify:exports
pnpm pack:dry-run
```

The example app tests run as part of `pnpm test`.
