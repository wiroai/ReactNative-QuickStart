/* eslint-disable import/no-duplicates */
// These imports must fail typechecking. If either becomes a public export,
// `tsc -p tsconfig.exports.json` fails with an unused @ts-expect-error.

// @ts-expect-error decodeSocketFrame must not be a public export
import type { decodeSocketFrame as _DeniedDecodeSocketFrame } from '@wiro-ai/wirokit-react-native';
// @ts-expect-error WiroSocketFrameLimits must not be a public export
import type { WiroSocketFrameLimits as _DeniedFrameLimits } from '@wiro-ai/wirokit-react-native';

export type DeniedPublicExports = [
  typeof _DeniedDecodeSocketFrame,
  _DeniedFrameLimits,
];
