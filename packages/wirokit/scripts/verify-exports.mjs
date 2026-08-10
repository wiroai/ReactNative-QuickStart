import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  WIROKIT_VERSION as importedVersion,
  WiroKitInfo as importedInfo,
} from '@wiro-ai/wirokit-react-native';

const require = createRequire(import.meta.url);
const requiredSdk = require('@wiro-ai/wirokit-react-native');

assert.equal(importedVersion, '0.1.0');
assert.equal(importedInfo.version, importedVersion);
assert.equal(requiredSdk.WIROKIT_VERSION, importedVersion);
assert.equal(requiredSdk.WiroKitInfo.version, importedVersion);
