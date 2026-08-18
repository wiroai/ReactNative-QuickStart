# Contributing

Thank you for improving the Wiro React Native SDK.

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Requirements

- Node.js 22.14.0 or newer
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
pnpm build
pnpm test
pnpm test:coverage
pnpm verify:exports
pnpm verify:hmac:hermes
pnpm expo:config
pnpm expo:export:ios
pnpm expo:export:android
pnpm pack:dry-run
```

The example app tests run as part of `pnpm test`.

## Releases

The package version and `WIROKIT_VERSION` must match; export verification
enforces this contract. Publish a GitHub Release whose tag is
`v<package-version>`. The release workflow runs all checks and publishes the
package with npm provenance.

The npm package must have trusted publishing configured for
`wiroai/ReactNative-QuickStart` and `.github/workflows/release.yml`.
