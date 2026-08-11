import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  WIROKIT_VERSION as importedVersion,
  ExpoWiroFileContentSource,
  ExpoWiroSocketSessionFactory,
  FetchWiroHttpTransport,
  Wiro,
  WiroClient,
  WiroFlux2ProOutputFormat,
  WiroFlux2ProRequest,
  WiroGptImage2Resolution,
  WiroKitInfo as importedInfo,
  WiroModelId,
  WiroModelSchema,
  WiroModelSort,
  WiroPaginatedResult,
  WiroTask,
  WiroSocketEvent,
  WiroSocketMessage,
  WiroTaskStatus,
  WiroTaskTrackingMode,
  WiroTaskUpdate,
  WiroTracking,
  WiroUploadResult,
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
assert.equal(typeof Wiro.flux2Pro, 'function');
assert.equal(typeof Wiro.gptImage2, 'function');
assert.equal(typeof Wiro.nanoBananaPro, 'function');
assert.equal(typeof Wiro.seedreamV4, 'function');
assert.equal(typeof Wiro.grokImagineImage, 'function');
assert.equal(typeof Wiro.runwayGen45, 'function');
assert.equal(typeof Wiro.seedance20, 'function');
assert.equal(typeof Wiro.klingV3, 'function');
assert.equal(typeof Wiro.veo31, 'function');
assert.equal(typeof Wiro.sora2Pro, 'function');
assert.equal(typeof Wiro.hailuo23Fast, 'function');
assert.equal(typeof Wiro.grokImagineVideo, 'function');
assert.equal(typeof Wiro.lyria3, 'function');
assert.equal(typeof WiroFlux2ProRequest, 'function');
assert.equal(WiroFlux2ProOutputFormat.png, 'png');
assert.equal(WiroGptImage2Resolution.r4k, '4k');
assert.equal(WiroTaskStatus.completed.isTerminal, true);
assert.equal(typeof WiroTask.parse, 'function');
assert.equal(WiroTaskTrackingMode.polling, 'polling');
assert.equal(typeof WiroTaskUpdate.snapshot, 'function');
assert.equal(WiroTracking.defaultTimeoutMs, 600_000);
assert.equal(typeof WiroUploadResult.parse, 'function');
assert.equal(typeof ExpoWiroFileContentSource, 'function');
assert.equal(typeof ExpoWiroSocketSessionFactory, 'function');
assert.equal(typeof WiroSocketEvent.message, 'function');
assert.equal(typeof WiroSocketMessage.parse, 'function');
client.close();
assert.equal(
  new requiredSdk.WiroModelId('owner', 'project').slug,
  'owner/project',
);
assert.equal(typeof requiredSdk.WiroClient, 'function');
assert.equal(typeof requiredSdk.WiroModelSchema, 'function');
assert.equal(typeof requiredSdk.WiroTask, 'function');
assert.equal(requiredSdk.WiroTaskTrackingMode.webSocket, 'webSocket');
assert.equal(typeof requiredSdk.WiroUploadResult, 'function');
assert.equal(typeof requiredSdk.WiroFlux2ProRequest, 'function');
assert.equal(requiredSdk.WiroKlingV3Mode.ultra4k, '4k');
assert.equal(typeof requiredSdk.ExpoWiroSocketSessionFactory, 'function');
