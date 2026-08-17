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

Run the example with `pnpm --filter @wiro-ai/example start`. Copy
`.env.example` to `.env` and set `EXPO_PUBLIC_WIRO_API_KEY` (and optionally
`EXPO_PUBLIC_WIRO_API_SECRET`) for a live FLUX.2 Pro generation.

```ts
import {
  Wiro,
  WiroClient,
  WiroFlux2ProOutputFormat,
} from '@wiro-ai/wirokit-react-native';

const client = new WiroClient({ apiKey: 'your-api-key' });
const result = await client.subscribe(
  Wiro.flux2Pro({
    prompt: 'A cinematic mountain lake',
    outputFormat: WiroFlux2ProOutputFormat.png,
  }),
);
```

Production mobile apps should call Wiro through a backend proxy instead of
shipping long-lived API secrets. `google/upscaler` is intentionally omitted
from the typed catalog; use `Wiro.model` for unlisted models.
