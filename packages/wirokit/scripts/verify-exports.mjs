import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  WIROKIT_VERSION as importedVersion,
  WiroKitInfo as importedInfo,
  WiroModelId,
  WiroValidationError,
  WiroValue,
} from '@wiro-ai/wirokit-react-native';

const require = createRequire(import.meta.url);
const requiredSdk = require('@wiro-ai/wirokit-react-native');

assert.equal(importedVersion, '0.1.0');
assert.equal(importedInfo.version, importedVersion);
assert.equal(requiredSdk.WIROKIT_VERSION, importedVersion);
assert.equal(requiredSdk.WiroKitInfo.version, importedVersion);
assert.equal(new WiroModelId('owner', 'project').slug, 'owner/project');
assert.equal(WiroValue.numberLexeme('1.2300').rawValue, '1.2300');
assert.ok(new WiroValidationError('Invalid.') instanceof Error);
assert.equal(
  new requiredSdk.WiroModelId('owner', 'project').slug,
  'owner/project',
);
