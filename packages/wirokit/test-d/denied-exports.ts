/* eslint-disable import/no-duplicates */
// These imports must fail typechecking. If any becomes a public export,
// `tsc -p tsconfig.exports.json` fails with an unused @ts-expect-error.

// @ts-expect-error createWiroClientForTests must not be a public export
import type { createWiroClientForTests as _DeniedTestClientFactory } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error createRuntimeDependencies must not be a public export
import type { createRuntimeDependencies as _DeniedRuntimeFactory } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error decodeSocketFrame must not be a public export
import type { decodeSocketFrame as _DeniedDecodeSocketFrame } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error makeRequestUrl must not be a public export
import type { makeRequestUrl as _DeniedRequestUrl } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error parseRetryAfter must not be a public export
import type { parseRetryAfter as _DeniedRetryAfter } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error taskInfoHandshakeJson must not be a public export
import type { taskInfoHandshakeJson as _DeniedHandshake } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error WiroSocketFrameLimits must not be a public export
import type { WiroSocketFrameLimits as _DeniedFrameLimits } from '@wiro-ai/wirokit-react-native';

export type DeniedPublicExports = [
  typeof _DeniedTestClientFactory,
  typeof _DeniedRuntimeFactory,
  typeof _DeniedDecodeSocketFrame,
  typeof _DeniedRequestUrl,
  typeof _DeniedRetryAfter,
  typeof _DeniedHandshake,
  _DeniedFrameLimits,
];
