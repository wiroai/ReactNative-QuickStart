import { describe, expect, it } from 'vitest';

import {
  Wiro,
  WiroClient,
  WiroFileInput,
  WiroFileInputValue,
  WiroFlux2ProOutputFormat,
  WiroGptImage2Background,
  WiroGptImage2Moderation,
  WiroGptImage2OutputFormat,
  WiroGptImage2Quality,
  WiroGptImage2Ratio,
  WiroGptImage2Resolution,
  WiroGrokImagineImageRatio,
  WiroGrokImagineImageResolution,
  WiroGrokImagineVideoRatio,
  WiroGrokImagineVideoResolution,
  WiroHailuo23FastResolution,
  WiroKlingV3Mode,
  WiroKlingV3Ratio,
  WiroKlingV3ShotType,
  type WiroModelRequest,
  WiroNanoBananaProRatio,
  WiroNanoBananaProResolution,
  WiroNanoBananaProSafetySetting,
  WiroRunwayGen45Moderation,
  WiroRunwayGen45Ratio,
  WiroSeedance20Ratio,
  WiroSeedance20Resolution,
  WiroSeedreamV4Size,
  WiroSora2ProRatio,
  WiroSora2ProResolution,
  WiroVeo31Ratio,
  WiroVeo31Resolution,
  stringifyWiroJson,
} from '../src';
import flux2ProFixture from './fixtures/wire/requests/flux2_pro.json';
import gptImage2Fixture from './fixtures/wire/requests/gpt_image_2.json';
import grokImagineImageFixture from './fixtures/wire/requests/grok_imagine_image.json';
import grokImagineVideoFixture from './fixtures/wire/requests/grok_imagine_video.json';
import hailuo23FastFixture from './fixtures/wire/requests/hailuo_23_fast.json';
import klingV3Fixture from './fixtures/wire/requests/kling_v3.json';
import lyria3Fixture from './fixtures/wire/requests/lyria_3.json';
import nanoBananaProFixture from './fixtures/wire/requests/nano_banana_pro.json';
import runwayGen45Fixture from './fixtures/wire/requests/runway_gen45.json';
import seedance20Fixture from './fixtures/wire/requests/seedance_20.json';
import seedreamV4Fixture from './fixtures/wire/requests/seedream_v4.json';
import sora2ProFixture from './fixtures/wire/requests/sora2_pro.json';
import veo31Fixture from './fixtures/wire/requests/veo31.json';
import { FakeHttpTransport } from './support/fake-http-transport';

const image = WiroFileInput.url('https://example.com/in.png');

describe('typed request golden wire payloads', () => {
  it.each([
    [
      Wiro.flux2Pro({
        height: 768,
        inputImages: [image],
        outputFormat: WiroFlux2ProOutputFormat.png,
        prompt: 'A mountain',
        safetyTolerance: 2,
        seed: 42,
        width: 1_024,
      }),
      flux2ProFixture,
      'black-forest-labs/flux-2-pro',
    ],
    [
      Wiro.gptImage2({
        background: WiroGptImage2Background.opaque,
        inputImageMasks: [WiroFileInput.url('https://example.com/mask.png')],
        inputImages: [image],
        moderation: WiroGptImage2Moderation.low,
        outputCompression: 80,
        outputFormat: WiroGptImage2OutputFormat.webp,
        prompt: 'A mug',
        quality: WiroGptImage2Quality.low,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 2,
      }),
      gptImage2Fixture,
      'openai/gpt-image-2',
    ],
    [
      Wiro.nanoBananaPro({
        aspectRatio: WiroNanoBananaProRatio.ultrawide21x9,
        inputImages: [image],
        prompt: 'A fox',
        resolution: WiroNanoBananaProResolution.r2k,
        safetySetting: WiroNanoBananaProSafetySetting.blockOnlyHigh,
      }),
      nanoBananaProFixture,
      'google/nano-banana-pro',
    ],
    [
      Wiro.seedreamV4({
        maxImages: 1,
        prompt: 'One poster',
        size: WiroSeedreamV4Size.panorama3024x1296,
        watermark: false,
      }),
      seedreamV4Fixture,
      'bytedance/seedream-v4',
    ],
    [
      Wiro.grokImagineImage({
        aspectRatio: WiroGrokImagineImageRatio.landscape19_5x9,
        prompt: 'A neon alley',
        resolution: WiroGrokImagineImageResolution.r2k,
        samples: 3,
      }),
      grokImagineImageFixture,
      'xai/grok-imagine-image',
    ],
    [
      Wiro.runwayGen45({
        contentModeration: WiroRunwayGen45Moderation.low,
        duration: 5,
        inputImages: [image],
        prompt: 'A drone shot',
        ratio: WiroRunwayGen45Ratio.landscape16x9,
        seed: 7,
      }),
      runwayGen45Fixture,
      'runway/gen-4-5',
    ],
    [
      Wiro.seedance20({
        duration: 4,
        generateAudio: false,
        prompt: 'A time-lapse',
        promptEnhancement: true,
        ratio: WiroSeedance20Ratio.adaptive,
        resolution: WiroSeedance20Resolution.r480p,
        seed: 1,
        watermark: false,
      }),
      seedance20Fixture,
      'bytedance/seedance-2-0',
    ],
    [
      Wiro.klingV3({
        duration: 5,
        mode: WiroKlingV3Mode.pro,
        prompt: 'walk',
        ratio: WiroKlingV3Ratio.square,
        sound: true,
      }),
      klingV3Fixture,
      'klingai/kling-v3',
    ],
    [
      Wiro.veo31({
        aspectRatio: WiroVeo31Ratio.landscape16x9,
        durationSeconds: 4,
        inputImage: [image],
        lastFrameImage: [image],
        negativePrompt: 'blur',
        prompt: 'ocean',
        referenceImages: [image],
        resolution: WiroVeo31Resolution.r720p,
        seed: 3,
      }),
      veo31Fixture,
      'google/veo3-1',
    ],
    [
      Wiro.sora2Pro({
        inputImages: [image],
        prompt: 'city',
        ratio: WiroSora2ProRatio.landscape16x9,
        resolution: WiroSora2ProResolution.r1080p,
        seconds: 8,
      }),
      sora2ProFixture,
      'openai/sora-2-pro',
    ],
    [
      Wiro.hailuo23Fast({
        duration: 6,
        inputImage: image,
        prompt: 'zoom',
        promptOptimizer: true,
        resolution: WiroHailuo23FastResolution.r768p,
      }),
      hailuo23FastFixture,
      'minimax/hailuo-2-3-fast',
    ],
    [
      Wiro.grokImagineVideo({
        aspectRatio: WiroGrokImagineVideoRatio.auto,
        duration: 5,
        prompt: 'rain',
        resolution: WiroGrokImagineVideoResolution.r720p,
      }),
      grokImagineVideoFixture,
      'xai/grok-imagine-video',
    ],
    [
      Wiro.lyria3({
        inputImages: [image],
        prompt: 'lofi',
      }),
      lyria3Fixture,
      'google/lyria-3',
    ],
  ] as const)('matches %# golden fixture', (request, fixture, slug) => {
    expect(request.model.slug).toBe(slug);
    expect(JSON.parse(stringifyWiroJson(request.parameters()))).toEqual(
      fixture,
    );
  });
});

describe('typed request omission and encoding', () => {
  it.each([
    [Wiro.flux2Pro({ prompt: 'p' }), ['prompt']],
    [
      Wiro.gptImage2({
        prompt: 'p',
        quality: WiroGptImage2Quality.high,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 1,
      }),
      ['prompt', 'resolution', 'ratio', 'quality', 'samples'],
    ],
    [Wiro.nanoBananaPro({ prompt: 'p' }), ['prompt']],
    [
      Wiro.seedreamV4({
        maxImages: 1,
        prompt: 'p',
        size: WiroSeedreamV4Size.square2048,
        watermark: false,
      }),
      ['prompt', 'size', 'maxImages', 'watermark'],
    ],
    [
      Wiro.grokImagineImage({
        prompt: 'p',
        resolution: WiroGrokImagineImageResolution.r1k,
        samples: 1,
      }),
      ['prompt', 'samples', 'resolution'],
    ],
    [
      Wiro.runwayGen45({
        duration: 1,
        prompt: 'p',
        ratio: WiroRunwayGen45Ratio.auto,
      }),
      ['prompt', 'ratio', 'duration'],
    ],
    [
      Wiro.seedance20({
        duration: 4,
        generateAudio: true,
        ratio: WiroSeedance20Ratio.adaptive,
        resolution: WiroSeedance20Resolution.r480p,
      }),
      ['resolution', 'ratio', 'duration', 'generateAudio'],
    ],
    [
      Wiro.klingV3({
        duration: 5,
        mode: WiroKlingV3Mode.standard,
        ratio: WiroKlingV3Ratio.square,
        sound: false,
      }),
      ['mode', 'duration', 'ratio', 'sound', 'multiPrompt'],
    ],
    [Wiro.veo31({ durationSeconds: 4 }), ['durationSeconds']],
    [Wiro.sora2Pro({ prompt: 'p', seconds: 4 }), ['prompt', 'seconds']],
    [
      Wiro.hailuo23Fast({
        duration: 6,
        inputImage: image,
      }),
      ['inputImage', 'duration'],
    ],
    [
      Wiro.grokImagineVideo({
        aspectRatio: WiroGrokImagineVideoRatio.auto,
        duration: 5,
        prompt: 'p',
        resolution: WiroGrokImagineVideoResolution.r480p,
      }),
      ['prompt', 'duration', 'aspectRatio', 'resolution'],
    ],
    [Wiro.lyria3({ prompt: 'p' }), ['prompt']],
  ] as const)('omits absent options for %#', (request, keys) => {
    expect(Object.keys(request.parameters())).toEqual(keys);
  });

  it('preserves empty file arrays and unresolved local files', () => {
    const empty = Wiro.flux2Pro({
      inputImages: [],
      prompt: 'p',
      width: 0,
    }).parameters();
    expect(JSON.parse(stringifyWiroJson(empty))).toEqual({
      inputImage: [],
      prompt: 'p',
      width: 0,
    });

    const local = Wiro.lyria3({
      inputImages: [WiroFileInput.bytes(new Uint8Array([1]), 'image.png')],
      prompt: 'p',
    }).parameters();
    const first = local.inputImage;
    expect(first?.kind).toBe('array');
    if (first?.kind === 'array') {
      expect(first.value[0]).toBeInstanceOf(WiroFileInputValue);
    }
  });

  it('encodes all remapped file and boolean keys', () => {
    const seedance = parse(
      Wiro.seedance20({
        duration: 4,
        generateAudio: true,
        inputImage: [image],
        lastFrameImage: [image],
        promptEnhancement: false,
        ratio: WiroSeedance20Ratio.adaptive,
        referenceAudios: [image],
        referenceImages: [image],
        resolution: WiroSeedance20Resolution.r720p,
        watermark: true,
      }),
    );
    expect(seedance).toMatchObject({
      generateAudio: 'true',
      inputAudio: ['https://example.com/in.png'],
      inputImage: ['https://example.com/in.png'],
      inputImageLast: ['https://example.com/in.png'],
      inputImageReference: ['https://example.com/in.png'],
      promptEnhancement: 'false',
      watermark: 'true',
    });

    const kling = parse(
      Wiro.klingV3({
        duration: 10,
        inputImage: [image],
        lastFrameImage: [image],
        mode: WiroKlingV3Mode.ultra4k,
        multiPrompt: 'shot',
        multiShot: true,
        ratio: WiroKlingV3Ratio.landscape16x9,
        shotType: WiroKlingV3ShotType.customize,
        sound: false,
      }),
    );
    expect(kling).toMatchObject({
      inputImage2: ['https://example.com/in.png'],
      mode: '4k',
      multiShot: 'true',
      shotType: 'customize',
      sound: 'off',
    });
  });

  it('defensively copies option arrays', () => {
    const files = [image];
    const request = Wiro.flux2Pro({
      inputImages: files,
      prompt: 'p',
    });
    files.length = 0;

    expect(parse(request).inputImage).toEqual(['https://example.com/in.png']);
    expect(() =>
      (request.options.inputImages as WiroFileInput[]).push(image),
    ).toThrow();
  });
});

describe('typed request validation', () => {
  it.each([
    () => Wiro.flux2Pro({ prompt: '' }),
    () => Wiro.flux2Pro({ prompt: 'p', width: 100 }),
    () =>
      Wiro.flux2Pro({
        prompt: 'p',
        safetyTolerance: 6,
      }),
    () => Wiro.flux2Pro({ prompt: 'p', seed: -1 }),
    () =>
      Wiro.gptImage2({
        prompt: '',
        quality: WiroGptImage2Quality.low,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 1,
      }),
    () =>
      Wiro.gptImage2({
        prompt: 'p',
        quality: WiroGptImage2Quality.low,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 11,
      }),
    () =>
      Wiro.nanoBananaPro({
        inputImages: Array.from({ length: 15 }, () => image),
        prompt: 'p',
      }),
    () =>
      Wiro.seedreamV4({
        maxImages: 0,
        prompt: 'p',
        size: WiroSeedreamV4Size.square2048,
        watermark: false,
      }),
    () =>
      Wiro.grokImagineImage({
        inputImages: [image, image],
        prompt: 'p',
        resolution: WiroGrokImagineImageResolution.r1k,
        samples: 1,
      }),
    () =>
      Wiro.runwayGen45({
        duration: 0,
        prompt: 'p',
        ratio: WiroRunwayGen45Ratio.auto,
      }),
    () =>
      Wiro.seedance20({
        duration: 3,
        generateAudio: false,
        ratio: WiroSeedance20Ratio.adaptive,
        resolution: WiroSeedance20Resolution.r480p,
      }),
    () =>
      Wiro.seedance20({
        duration: 4,
        generateAudio: false,
        ratio: WiroSeedance20Ratio.adaptive,
        referenceImages: [],
        resolution: WiroSeedance20Resolution.r480p,
      }),
    () =>
      Wiro.klingV3({
        duration: 7,
        mode: WiroKlingV3Mode.pro,
        ratio: WiroKlingV3Ratio.square,
        sound: true,
      }),
    () =>
      Wiro.klingV3({
        duration: 5,
        mode: WiroKlingV3Mode.pro,
        multiShot: true,
        ratio: WiroKlingV3Ratio.square,
        shotType: WiroKlingV3ShotType.customize,
        sound: true,
      }),
    () => Wiro.veo31({ durationSeconds: 5 }),
    () => Wiro.sora2Pro({ prompt: 'p', seconds: 7 }),
    () =>
      Wiro.hailuo23Fast({
        duration: 10,
        inputImage: image,
        resolution: WiroHailuo23FastResolution.r1080p,
      }),
    () =>
      Wiro.grokImagineVideo({
        aspectRatio: WiroGrokImagineVideoRatio.auto,
        duration: 5,
        inputImages: [image, image],
        prompt: 'p',
        resolution: WiroGrokImagineVideoResolution.r720p,
      }),
    () => Wiro.lyria3({ prompt: '' }),
  ])('rejects invalid input %#', (create) => {
    expect(create).toThrow();
  });

  it('rejects invalid numeric forms and exact boundaries', () => {
    expect(() =>
      Wiro.runwayGen45({
        duration: 1.5,
        prompt: 'p',
        ratio: WiroRunwayGen45Ratio.auto,
      }),
    ).toThrow('duration must be an integer.');
    expect(() =>
      Wiro.runwayGen45({
        duration: 1,
        prompt: 'p',
        ratio: WiroRunwayGen45Ratio.auto,
        seed: 4_294_967_296,
      }),
    ).toThrow('seed must be between 0 and 4294967295.');
    expect(() =>
      Wiro.hailuo23Fast({
        duration: 10,
        inputImage: image,
        resolution: WiroHailuo23FastResolution.r1080p,
      }),
    ).toThrow('10-second videos are only available at 768P.');
  });

  it.each([
    () =>
      Wiro.gptImage2({
        outputCompression: 101,
        prompt: 'p',
        quality: WiroGptImage2Quality.low,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 1,
      }),
    () =>
      Wiro.gptImage2({
        prompt: 'p'.repeat(32_001),
        quality: WiroGptImage2Quality.low,
        ratio: WiroGptImage2Ratio.square,
        resolution: WiroGptImage2Resolution.r1k,
        samples: 1,
      }),
    () => Wiro.nanoBananaPro({ prompt: '' }),
    () =>
      Wiro.seedreamV4({
        maxImages: 16,
        prompt: 'p',
        size: WiroSeedreamV4Size.square2048,
        watermark: false,
      }),
    () =>
      Wiro.grokImagineImage({
        prompt: '',
        resolution: WiroGrokImagineImageResolution.r1k,
        samples: 1,
      }),
    () =>
      Wiro.grokImagineImage({
        prompt: 'p',
        resolution: WiroGrokImagineImageResolution.r1k,
        samples: 0,
      }),
    () =>
      Wiro.runwayGen45({
        duration: 1,
        prompt: 'p'.repeat(1_001),
        ratio: WiroRunwayGen45Ratio.auto,
      }),
    () =>
      Wiro.runwayGen45({
        duration: 1,
        prompt: 'p',
        ratio: WiroRunwayGen45Ratio.auto,
        seed: -1,
      }),
    () =>
      Wiro.seedance20({
        duration: 4,
        generateAudio: false,
        ratio: WiroSeedance20Ratio.adaptive,
        referenceAudios: [],
        resolution: WiroSeedance20Resolution.r480p,
      }),
    () =>
      Wiro.seedance20({
        duration: 4,
        generateAudio: false,
        ratio: WiroSeedance20Ratio.adaptive,
        referenceAudios: [image, image, image, image],
        resolution: WiroSeedance20Resolution.r480p,
      }),
    () =>
      Wiro.seedance20({
        duration: 4,
        generateAudio: false,
        ratio: WiroSeedance20Ratio.adaptive,
        resolution: WiroSeedance20Resolution.r480p,
        seed: -1,
      }),
    () =>
      Wiro.veo31({
        durationSeconds: 4,
        referenceImages: [],
      }),
    () =>
      Wiro.veo31({
        durationSeconds: 4,
        seed: -1,
      }),
    () => Wiro.sora2Pro({ prompt: '', seconds: 4 }),
    () =>
      Wiro.hailuo23Fast({
        duration: 7,
        inputImage: image,
      }),
    () =>
      Wiro.grokImagineVideo({
        aspectRatio: WiroGrokImagineVideoRatio.auto,
        duration: 7,
        prompt: 'p',
        resolution: WiroGrokImagineVideoResolution.r720p,
      }),
    () =>
      Wiro.grokImagineVideo({
        aspectRatio: WiroGrokImagineVideoRatio.auto,
        duration: 5,
        prompt: '',
        resolution: WiroGrokImagineVideoResolution.r720p,
      }),
  ])('covers remaining validation boundary %#', (create) => {
    expect(create).toThrow();
  });
});

describe('typed enum catalogs', () => {
  it('preserves every exact reference wire value', () => {
    expect(WiroFlux2ProOutputFormat).toEqual({
      jpeg: 'jpeg',
      png: 'png',
    });
    expect(Object.values(WiroGptImage2Ratio)).toEqual(
      expect.arrayContaining([
        '1:1',
        '3:2',
        '2:3',
        '4:3',
        '3:4',
        '16:9',
        '9:16',
      ]),
    );
    expect(Object.values(WiroNanoBananaProResolution)).toEqual([
      '1K',
      '2K',
      '4K',
    ]);
    expect(Object.values(WiroNanoBananaProSafetySetting)).toEqual(
      expect.arrayContaining([
        'BLOCK_LOW_AND_ABOVE',
        'BLOCK_MEDIUM_AND_ABOVE',
        'BLOCK_ONLY_HIGH',
        'BLOCK_NONE',
        'OFF',
      ]),
    );
    expect(Object.values(WiroSeedreamV4Size)).toHaveLength(8);
    expect(Object.values(WiroGrokImagineImageRatio)).toEqual(
      expect.arrayContaining(['19.5:9', '9:19.5', '20:9', '9:20']),
    );
    expect(WiroKlingV3Mode.ultra4k).toBe('4k');
    expect(WiroVeo31Ratio.matchInputImage).toBe('match_input_image');
    expect(Object.values(WiroHailuo23FastResolution)).toEqual([
      '1080P',
      '768P',
    ]);
    expect(Object.values(WiroGrokImagineVideoRatio)).toHaveLength(8);
  });

  it('covers every enum case', () => {
    const catalog = {
      flux: Object.values(WiroFlux2ProOutputFormat),
      gptBackground: Object.values(WiroGptImage2Background),
      gptFormat: Object.values(WiroGptImage2OutputFormat),
      gptModeration: Object.values(WiroGptImage2Moderation),
      gptQuality: Object.values(WiroGptImage2Quality),
      gptRatio: Object.values(WiroGptImage2Ratio),
      gptResolution: Object.values(WiroGptImage2Resolution),
      grokImageRatio: Object.values(WiroGrokImagineImageRatio),
      grokImageResolution: Object.values(WiroGrokImagineImageResolution),
      grokVideoRatio: Object.values(WiroGrokImagineVideoRatio),
      grokVideoResolution: Object.values(WiroGrokImagineVideoResolution),
      hailuo: Object.values(WiroHailuo23FastResolution),
      klingMode: Object.values(WiroKlingV3Mode),
      klingRatio: Object.values(WiroKlingV3Ratio),
      klingShot: Object.values(WiroKlingV3ShotType),
      nanoRatio: Object.values(WiroNanoBananaProRatio),
      nanoResolution: Object.values(WiroNanoBananaProResolution),
      nanoSafety: Object.values(WiroNanoBananaProSafetySetting),
      runwayModeration: Object.values(WiroRunwayGen45Moderation),
      runwayRatio: Object.values(WiroRunwayGen45Ratio),
      seedanceRatio: Object.values(WiroSeedance20Ratio),
      seedanceResolution: Object.values(WiroSeedance20Resolution),
      seedream: Object.values(WiroSeedreamV4Size),
      soraRatio: Object.values(WiroSora2ProRatio),
      soraResolution: Object.values(WiroSora2ProResolution),
      veoRatio: Object.values(WiroVeo31Ratio),
      veoResolution: Object.values(WiroVeo31Resolution),
    };

    expect(catalog).toMatchInlineSnapshot(`
      {
        "flux": [
          "jpeg",
          "png",
        ],
        "gptBackground": [
          "auto",
          "opaque",
        ],
        "gptFormat": [
          "jpeg",
          "png",
          "webp",
        ],
        "gptModeration": [
          "auto",
          "low",
        ],
        "gptQuality": [
          "high",
          "low",
          "medium",
        ],
        "gptRatio": [
          "16:9",
          "3:2",
          "2:3",
          "3:4",
          "9:16",
          "1:1",
          "4:3",
        ],
        "gptResolution": [
          "1k",
          "2k",
          "4k",
        ],
        "grokImageRatio": [
          "16:9",
          "19.5:9",
          "20:9",
          "2:1",
          "3:2",
          "1:2",
          "2:3",
          "3:4",
          "9:16",
          "9:19.5",
          "9:20",
          "1:1",
          "4:3",
        ],
        "grokImageResolution": [
          "1k",
          "2k",
        ],
        "grokVideoRatio": [
          "auto",
          "16:9",
          "3:2",
          "2:3",
          "3:4",
          "9:16",
          "1:1",
          "4:3",
        ],
        "grokVideoResolution": [
          "480p",
          "720p",
        ],
        "hailuo": [
          "1080P",
          "768P",
        ],
        "klingMode": [
          "pro",
          "std",
          "4k",
        ],
        "klingRatio": [
          "16:9",
          "9:16",
          "1:1",
        ],
        "klingShot": [
          "customize",
          "intelligence",
        ],
        "nanoRatio": [
          "16:9",
          "3:2",
          "5:4",
          "2:3",
          "3:4",
          "4:5",
          "9:16",
          "1:1",
          "4:3",
          "21:9",
        ],
        "nanoResolution": [
          "1K",
          "2K",
          "4K",
        ],
        "nanoSafety": [
          "BLOCK_LOW_AND_ABOVE",
          "BLOCK_MEDIUM_AND_ABOVE",
          "BLOCK_NONE",
          "BLOCK_ONLY_HIGH",
          "OFF",
        ],
        "runwayModeration": [
          "auto",
          "low",
        ],
        "runwayRatio": [
          "auto",
          "16:9",
          "3:4",
          "9:16",
          "1:1",
          "4:3",
          "21:9",
        ],
        "seedanceRatio": [
          "adaptive",
          "16:9",
          "3:4",
          "9:16",
          "1:1",
          "4:3",
          "21:9",
        ],
        "seedanceResolution": [
          "1080p",
          "480p",
          "4k",
          "720p",
        ],
        "seedream": [
          "2304x1728",
          "2496x1664",
          "2560x1440",
          "3024x1296",
          "1440x2560",
          "1664x2496",
          "1728x2304",
          "2048x2048",
        ],
        "soraRatio": [
          "auto",
          "16:9",
          "9:16",
        ],
        "soraResolution": [
          "1024p",
          "1080p",
          "720p",
        ],
        "veoRatio": [
          "16:9",
          "match_input_image",
          "9:16",
        ],
        "veoResolution": [
          "1080p",
          "4k",
          "720p",
        ],
      }
    `);
  });
});

describe('typed client integration', () => {
  it('runs a typed request with exact path and payload', async () => {
    const transport = new FakeHttpTransport();
    transport.enqueueJson(200, '{"result":true}');
    const client = new WiroClient({
      apiKey: 'test-api-key',
      transport,
    });

    await client.run(
      Wiro.flux2Pro({
        prompt: 'A mountain',
      }),
    );

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toContain(
      '/Run/black-forest-labs/flux-2-pro',
    );
    expect(JSON.parse(transport.requests[0]?.body ?? '{}')).toEqual({
      prompt: 'A mountain',
    });
  });

  it('rejects invalid factories before any network call', () => {
    const transport = new FakeHttpTransport();
    const client = new WiroClient({
      apiKey: 'test-api-key',
      transport,
    });

    expect(() =>
      client.run(
        Wiro.flux2Pro({
          prompt: '',
        }),
      ),
    ).toThrow('prompt cannot be empty.');
    expect(transport.requests).toHaveLength(0);
  });
});

function parse(request: WiroModelRequest): Record<string, unknown> {
  return JSON.parse(stringifyWiroJson(request.parameters())) as Record<
    string,
    unknown
  >;
}
