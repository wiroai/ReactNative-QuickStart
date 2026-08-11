import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  WIROKIT_VERSION as importedVersion,
  FetchWiroHttpTransport,
  Wiro,
  WiroClient,
  WiroKitInfo as importedInfo,
  WiroModelId,
  WiroModelSchema,
  WiroModelSort,
  WiroPaginatedResult,
  WiroTask,
  WiroTaskStatus,
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
const client = new WiroClient({ apiKey: 'test-api-key' });
assert.equal(client.authType, 'apiKey');
assert.equal(typeof FetchWiroHttpTransport, 'function');
assert.equal(WiroModelSort.ratedUserCount, 'ratedusercount');
assert.equal(typeof WiroModelSchema.parse, 'function');
assert.equal(typeof WiroPaginatedResult.parse, 'function');
assert.equal(Wiro.model('owner/project', {}).model.slug, 'owner/project');
assert.equal(WiroTaskStatus.completed.isTerminal, true);
assert.equal(typeof WiroTask.parse, 'function');
client.close();
assert.equal(
  new requiredSdk.WiroModelId('owner', 'project').slug,
  'owner/project',
);
assert.equal(typeof requiredSdk.WiroClient, 'function');
assert.equal(typeof requiredSdk.WiroModelSchema, 'function');
assert.equal(typeof requiredSdk.WiroTask, 'function');
