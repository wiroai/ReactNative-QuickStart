import { type WiroFileInput, WiroUrlFileInput } from '../core/file-input';
import { WiroModelId } from '../core/identifiers';
import {
  type WiroJson,
  type WiroValue as WiroValueType,
  WiroValue,
} from '../core/wiro-value';
import { WiroValidationError } from '../errors/wiro-error';
import type { WiroModelRequest } from './model-request';
import {
  type WiroFlux2ProOutputFormat,
  type WiroGptImage2Background,
  type WiroGptImage2Moderation,
  type WiroGptImage2OutputFormat,
  type WiroGptImage2Quality,
  type WiroGptImage2Ratio,
  type WiroGptImage2Resolution,
  type WiroGrokImagineImageRatio,
  type WiroGrokImagineImageResolution,
  type WiroGrokImagineVideoRatio,
  type WiroGrokImagineVideoResolution,
  type WiroHailuo23FastResolution,
  type WiroKlingV3Mode,
  type WiroKlingV3Ratio,
  WiroKlingV3ShotType,
  type WiroKlingV3ShotType as WiroKlingV3ShotTypeValue,
  type WiroNanoBananaProRatio,
  type WiroNanoBananaProResolution,
  type WiroNanoBananaProSafetySetting,
  type WiroRunwayGen45Moderation,
  type WiroRunwayGen45Ratio,
  type WiroSeedance20Ratio,
  type WiroSeedance20Resolution,
  type WiroSeedreamV4Size,
  type WiroSora2ProRatio,
  type WiroSora2ProResolution,
  type WiroVeo31Ratio,
  type WiroVeo31Resolution,
} from './request-enums';

type JsonBuilder = Record<string, WiroValueType>;

abstract class WiroTypedRequest implements WiroModelRequest {
  readonly model: WiroModelId;

  protected constructor(owner: string, project: string) {
    this.model = new WiroModelId(owner, project);
  }

  abstract parameters(): WiroJson;
}

export interface WiroFlux2ProRequestOptions {
  readonly height?: number;
  readonly inputImages?: readonly WiroFileInput[];
  readonly outputFormat?: WiroFlux2ProOutputFormat;
  readonly prompt: string;
  readonly safetyTolerance?: number;
  readonly seed?: number;
  readonly width?: number;
}

export class WiroFlux2ProRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroFlux2ProRequestOptions>;

  constructor(options: WiroFlux2ProRequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireFluxDimension(options.width, 'width');
    requireFluxDimension(options.height, 'height');
    requireOptionalRange(options.safetyTolerance, 0, 5, 'safetyTolerance');
    requireNonNegative(options.seed, 'seed');
    super('black-forest-labs', 'flux-2-pro');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImages);
    setNumber(json, 'width', this.options.width);
    setNumber(json, 'height', this.options.height);
    setNumber(json, 'safetyTolerance', this.options.safetyTolerance);
    setNumber(json, 'seed', this.options.seed);
    setString(json, 'outputFormat', this.options.outputFormat);
    return finish(json);
  }
}

export interface WiroGptImage2RequestOptions {
  readonly background?: WiroGptImage2Background;
  readonly inputImageMasks?: readonly WiroFileInput[];
  readonly inputImages?: readonly WiroFileInput[];
  readonly moderation?: WiroGptImage2Moderation;
  readonly outputCompression?: number;
  readonly outputFormat?: WiroGptImage2OutputFormat;
  readonly prompt: string;
  readonly quality: WiroGptImage2Quality;
  readonly ratio: WiroGptImage2Ratio;
  readonly resolution: WiroGptImage2Resolution;
  readonly samples: number;
}

export class WiroGptImage2Request extends WiroTypedRequest {
  readonly options: Readonly<WiroGptImage2RequestOptions>;

  constructor(options: WiroGptImage2RequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireMaxLength(options.prompt, 32_000, 'prompt');
    requireRange(options.samples, 1, 10, 'samples');
    requireOptionalRange(
      options.outputCompression,
      0,
      100,
      'outputCompression',
    );
    super('openai', 'gpt-image-2');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.resolution = WiroValue.string(this.options.resolution);
    json.ratio = WiroValue.string(this.options.ratio);
    json.quality = WiroValue.string(this.options.quality);
    json.samples = WiroValue.number(this.options.samples);
    setFiles(json, 'inputImage', this.options.inputImages);
    setFiles(json, 'inputImageMask', this.options.inputImageMasks);
    setString(json, 'background', this.options.background);
    setString(json, 'outputFormat', this.options.outputFormat);
    setNumber(json, 'outputCompression', this.options.outputCompression);
    setString(json, 'moderation', this.options.moderation);
    return finish(json);
  }
}

export interface WiroNanoBananaProRequestOptions {
  readonly aspectRatio?: WiroNanoBananaProRatio;
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
  readonly resolution?: WiroNanoBananaProResolution;
  readonly safetySetting?: WiroNanoBananaProSafetySetting;
}

export class WiroNanoBananaProRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroNanoBananaProRequestOptions>;

  constructor(options: WiroNanoBananaProRequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireOptionalCount(options.inputImages, 14, 'inputImages');
    super('google', 'nano-banana-pro');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImages);
    setString(json, 'aspectRatio', this.options.aspectRatio);
    setString(json, 'resolution', this.options.resolution);
    setString(json, 'safetySetting', this.options.safetySetting);
    return finish(json);
  }
}

export interface WiroSeedreamV4RequestOptions {
  readonly inputImages?: readonly WiroFileInput[];
  readonly maxImages: number;
  readonly prompt: string;
  readonly size: WiroSeedreamV4Size;
  readonly watermark: boolean;
}

export class WiroSeedreamV4Request extends WiroTypedRequest {
  readonly options: Readonly<WiroSeedreamV4RequestOptions>;

  constructor(options: WiroSeedreamV4RequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireRange(options.maxImages, 1, 15, 'maxImages');
    super('bytedance', 'seedream-v4');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.size = WiroValue.string(this.options.size);
    json.maxImages = WiroValue.number(this.options.maxImages);
    json.watermark = stringBoolean(this.options.watermark);
    setFiles(json, 'inputImage', this.options.inputImages);
    return finish(json);
  }
}

export interface WiroGrokImagineImageRequestOptions {
  readonly aspectRatio?: WiroGrokImagineImageRatio;
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
  readonly resolution: WiroGrokImagineImageResolution;
  readonly samples: number;
}

export class WiroGrokImagineImageRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroGrokImagineImageRequestOptions>;

  constructor(options: WiroGrokImagineImageRequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireRange(options.samples, 1, 10, 'samples');
    requireOptionalCount(options.inputImages, 1, 'inputImages');
    super('xai', 'grok-imagine-image');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.samples = WiroValue.number(this.options.samples);
    json.resolution = WiroValue.string(this.options.resolution);
    setFiles(json, 'inputImage', this.options.inputImages);
    setString(json, 'aspectRatio', this.options.aspectRatio);
    return finish(json);
  }
}

export interface WiroRunwayGen45RequestOptions {
  readonly contentModeration?: WiroRunwayGen45Moderation;
  readonly duration: number;
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
  readonly ratio: WiroRunwayGen45Ratio;
  readonly seed?: number;
}

export class WiroRunwayGen45Request extends WiroTypedRequest {
  readonly options: Readonly<WiroRunwayGen45RequestOptions>;

  constructor(options: WiroRunwayGen45RequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireMaxLength(options.prompt, 1_000, 'prompt');
    requireInteger(options.duration, 'duration');
    if (options.duration <= 0) {
      fail('duration must be positive.');
    }
    if (
      options.seed !== undefined &&
      (!Number.isSafeInteger(options.seed) ||
        options.seed < 0 ||
        options.seed > 4_294_967_295)
    ) {
      fail('seed must be between 0 and 4294967295.');
    }
    super('runway', 'gen-4-5');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.ratio = WiroValue.string(this.options.ratio);
    json.duration = WiroValue.number(this.options.duration);
    setFiles(json, 'inputImage', this.options.inputImages);
    setString(json, 'contentModeration', this.options.contentModeration);
    setNumber(json, 'seed', this.options.seed);
    return finish(json);
  }
}

export interface WiroSeedance20RequestOptions {
  readonly duration: number;
  readonly generateAudio: boolean;
  readonly inputImage?: readonly WiroFileInput[];
  readonly lastFrameImage?: readonly WiroFileInput[];
  readonly prompt?: string;
  readonly promptEnhancement?: boolean;
  readonly ratio: WiroSeedance20Ratio;
  readonly referenceAudios?: readonly WiroFileInput[];
  readonly referenceImages?: readonly WiroFileInput[];
  readonly resolution: WiroSeedance20Resolution;
  readonly seed?: number;
  readonly watermark?: boolean;
}

export class WiroSeedance20Request extends WiroTypedRequest {
  readonly options: Readonly<WiroSeedance20RequestOptions>;

  constructor(options: WiroSeedance20RequestOptions) {
    requireRange(options.duration, 4, 15, 'duration');
    requireOptionalCountRange(options.referenceImages, 1, 9, 'referenceImages');
    requireOptionalCountRange(options.referenceAudios, 1, 3, 'referenceAudios');
    requireNonNegative(options.seed, 'seed');
    super('bytedance', 'seedance-2-0');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.resolution = WiroValue.string(this.options.resolution);
    json.ratio = WiroValue.string(this.options.ratio);
    json.duration = stringInteger(this.options.duration);
    json.generateAudio = stringBoolean(this.options.generateAudio);
    setString(json, 'prompt', this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImage);
    setFiles(json, 'inputImageLast', this.options.lastFrameImage);
    setFiles(json, 'inputImageReference', this.options.referenceImages);
    setFiles(json, 'inputAudio', this.options.referenceAudios);
    setStringBoolean(json, 'promptEnhancement', this.options.promptEnhancement);
    setStringBoolean(json, 'watermark', this.options.watermark);
    setNumber(json, 'seed', this.options.seed);
    return finish(json);
  }
}

export interface WiroKlingV3RequestOptions {
  readonly duration: number;
  readonly inputImage?: readonly WiroFileInput[];
  readonly lastFrameImage?: readonly WiroFileInput[];
  readonly mode: WiroKlingV3Mode;
  readonly multiPrompt?: string;
  readonly multiShot?: boolean;
  readonly prompt?: string;
  readonly ratio: WiroKlingV3Ratio;
  readonly shotType?: WiroKlingV3ShotTypeValue;
  readonly sound: boolean;
}

export class WiroKlingV3Request extends WiroTypedRequest {
  readonly options: Readonly<WiroKlingV3RequestOptions>;

  constructor(options: WiroKlingV3RequestOptions) {
    requireOneOf(options.duration, [5, 10, 15], 'duration');
    if (
      options.multiShot === true &&
      options.shotType === WiroKlingV3ShotType.customize &&
      options.multiPrompt === undefined
    ) {
      fail(
        'multiPrompt is required when multiShot is true and ' +
          'shotType is customize.',
      );
    }
    super('klingai', 'kling-v3');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.mode = WiroValue.string(this.options.mode);
    json.duration = stringInteger(this.options.duration);
    json.ratio = WiroValue.string(this.options.ratio);
    json.sound = WiroValue.string(this.options.sound ? 'on' : 'off');
    json.multiPrompt = WiroValue.string(this.options.multiPrompt ?? '');
    setString(json, 'prompt', this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImage);
    setFiles(json, 'inputImage2', this.options.lastFrameImage);
    setStringBoolean(json, 'multiShot', this.options.multiShot);
    setString(json, 'shotType', this.options.shotType);
    return finish(json);
  }
}

export interface WiroVeo31RequestOptions {
  readonly aspectRatio?: WiroVeo31Ratio;
  readonly durationSeconds: number;
  readonly inputImage?: readonly WiroFileInput[];
  readonly lastFrameImage?: readonly WiroFileInput[];
  readonly negativePrompt?: string;
  readonly prompt?: string;
  readonly referenceImages?: readonly WiroFileInput[];
  readonly resolution?: WiroVeo31Resolution;
  readonly seed?: number;
}

export class WiroVeo31Request extends WiroTypedRequest {
  readonly options: Readonly<WiroVeo31RequestOptions>;

  constructor(options: WiroVeo31RequestOptions) {
    requireOneOf(options.durationSeconds, [4, 6, 8], 'durationSeconds');
    requireOptionalCountRange(options.referenceImages, 1, 3, 'referenceImages');
    requireNonNegative(options.seed, 'seed');
    super('google', 'veo3-1');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.durationSeconds = stringInteger(this.options.durationSeconds);
    setString(json, 'prompt', this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImage);
    setFiles(json, 'inputImage2', this.options.lastFrameImage);
    setFiles(json, 'inputImage3', this.options.referenceImages);
    setString(json, 'aspectRatio', this.options.aspectRatio);
    setString(json, 'resolution', this.options.resolution);
    setString(json, 'negativePrompt', this.options.negativePrompt);
    setNumber(json, 'seed', this.options.seed);
    return finish(json);
  }
}

export interface WiroSora2ProRequestOptions {
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
  readonly ratio?: WiroSora2ProRatio;
  readonly resolution?: WiroSora2ProResolution;
  readonly seconds: number;
}

export class WiroSora2ProRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroSora2ProRequestOptions>;

  constructor(options: WiroSora2ProRequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireOneOf(options.seconds, [4, 8, 12, 16, 20], 'seconds');
    super('openai', 'sora-2-pro');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.seconds = stringInteger(this.options.seconds);
    setFiles(json, 'inputImage', this.options.inputImages);
    setString(json, 'resolution', this.options.resolution);
    setString(json, 'ratio', this.options.ratio);
    return finish(json);
  }
}

export interface WiroHailuo23FastRequestOptions {
  readonly duration: number;
  readonly inputImage: WiroFileInput;
  readonly prompt?: string;
  readonly promptOptimizer?: boolean;
  readonly resolution?: WiroHailuo23FastResolution;
}

export class WiroHailuo23FastRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroHailuo23FastRequestOptions>;

  constructor(options: WiroHailuo23FastRequestOptions) {
    requireOneOf(options.duration, [6, 10], 'duration');
    if (options.duration === 10 && options.resolution === '1080P') {
      fail('10-second videos are only available at 768P.');
    }
    super('minimax', 'hailuo-2-3-fast');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.inputImage = filesRequired([this.options.inputImage]);
    json.duration = stringInteger(this.options.duration);
    setString(json, 'prompt', this.options.prompt);
    setStringBoolean(json, 'promptOptimizer', this.options.promptOptimizer);
    setString(json, 'resolution', this.options.resolution);
    return finish(json);
  }
}

export interface WiroGrokImagineVideoRequestOptions {
  readonly aspectRatio: WiroGrokImagineVideoRatio;
  readonly duration: number;
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
  readonly resolution: WiroGrokImagineVideoResolution;
}

export class WiroGrokImagineVideoRequest extends WiroTypedRequest {
  readonly options: Readonly<WiroGrokImagineVideoRequestOptions>;

  constructor(options: WiroGrokImagineVideoRequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    requireOneOf(options.duration, [5, 10, 15], 'duration');
    requireOptionalCount(options.inputImages, 1, 'inputImages');
    super('xai', 'grok-imagine-video');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    json.duration = stringInteger(this.options.duration);
    json.aspectRatio = WiroValue.string(this.options.aspectRatio);
    json.resolution = WiroValue.string(this.options.resolution);
    setFiles(json, 'inputImage', this.options.inputImages);
    return finish(json);
  }
}

export interface WiroLyria3RequestOptions {
  readonly inputImages?: readonly WiroFileInput[];
  readonly prompt: string;
}

export class WiroLyria3Request extends WiroTypedRequest {
  readonly options: Readonly<WiroLyria3RequestOptions>;

  constructor(options: WiroLyria3RequestOptions) {
    requireNonEmpty(options.prompt, 'prompt');
    super('google', 'lyria-3');
    this.options = freezeOptions(options);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    const json = builder();
    json.prompt = WiroValue.string(this.options.prompt);
    setFiles(json, 'inputImage', this.options.inputImages);
    return finish(json);
  }
}

function builder(): JsonBuilder {
  return Object.create(null) as JsonBuilder;
}

function finish(json: Readonly<Record<string, WiroValueType>>): WiroJson {
  return WiroValue.object(json).value;
}

function setString(
  json: JsonBuilder,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    json[key] = WiroValue.string(value);
  }
}

function setNumber(
  json: JsonBuilder,
  key: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    json[key] = WiroValue.number(value);
  }
}

function setStringBoolean(
  json: JsonBuilder,
  key: string,
  value: boolean | undefined,
): void {
  if (value !== undefined) {
    json[key] = stringBoolean(value);
  }
}

function setFiles(
  json: JsonBuilder,
  key: string,
  value: readonly WiroFileInput[] | undefined,
): void {
  if (value !== undefined) {
    json[key] = filesRequired(value);
  }
}

function filesRequired(
  files: readonly WiroFileInput[],
): ReturnType<typeof WiroValue.array> {
  return WiroValue.array(
    files.map((file) =>
      file instanceof WiroUrlFileInput
        ? WiroValue.string(file.wireValue)
        : WiroValue.fileInput(file),
    ),
  );
}

function stringBoolean(value: boolean): ReturnType<typeof WiroValue.string> {
  return WiroValue.string(value ? 'true' : 'false');
}

function stringInteger(value: number): ReturnType<typeof WiroValue.string> {
  return WiroValue.string(value.toString());
}

function freezeOptions<T extends object>(options: T): Readonly<T> {
  const copy = {
    ...options,
  } as Record<string, unknown>;
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) {
      copy[key] = Object.freeze([...value]);
    }
  }
  return Object.freeze(copy) as Readonly<T>;
}

function requireNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    fail(`${label} cannot be empty.`);
  }
}

function requireMaxLength(value: string, max: number, label: string): void {
  if (value.length > max) {
    fail(`${label} cannot exceed ${max} characters.`);
  }
}

function requireInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    fail(`${label} must be an integer.`);
  }
}

function requireRange(
  value: number,
  min: number,
  max: number,
  label: string,
): void {
  requireInteger(value, label);
  if (value < min || value > max) {
    fail(`${label} must be between ${min} and ${max}.`);
  }
}

function requireOptionalRange(
  value: number | undefined,
  min: number,
  max: number,
  label: string,
): void {
  if (value !== undefined) {
    requireRange(value, min, max, label);
  }
}

function requireNonNegative(value: number | undefined, label: string): void {
  if (value !== undefined) {
    requireInteger(value, label);
    if (value < 0) {
      fail(`${label} cannot be negative.`);
    }
  }
}

function requireFluxDimension(value: number | undefined, label: string): void {
  if (value === undefined) {
    return;
  }
  requireInteger(value, label);
  if (value !== 0 && (value < 64 || value > 2_048 || value % 16 !== 0)) {
    fail(`${label} must be 0 or a multiple of 16 between 64 and 2048.`);
  }
}

function requireOneOf(
  value: number,
  allowed: readonly number[],
  label: string,
): void {
  requireInteger(value, label);
  if (!allowed.includes(value)) {
    fail(`${label} must be one of: ${allowed.join(', ')}.`);
  }
}

function requireOptionalCount(
  files: readonly WiroFileInput[] | undefined,
  max: number,
  label: string,
): void {
  if (files !== undefined && files.length > max) {
    fail(`${label} cannot exceed ${max} references.`);
  }
}

function requireOptionalCountRange(
  files: readonly WiroFileInput[] | undefined,
  min: number,
  max: number,
  label: string,
): void {
  if (files !== undefined && (files.length < min || files.length > max)) {
    fail(`${label} must contain between ${min} and ${max} items.`);
  }
}

function fail(message: string): never {
  throw new WiroValidationError(message);
}
