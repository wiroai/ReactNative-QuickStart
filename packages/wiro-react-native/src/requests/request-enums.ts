function enumValues<const T extends Readonly<Record<string, string>>>(
  values: T,
): Readonly<T> {
  return Object.freeze(values);
}

export const WiroFlux2ProOutputFormat = enumValues({
  jpeg: 'jpeg',
  png: 'png',
});
export type WiroFlux2ProOutputFormat =
  (typeof WiroFlux2ProOutputFormat)[keyof typeof WiroFlux2ProOutputFormat];

export const WiroGptImage2Resolution = enumValues({
  r1k: '1k',
  r2k: '2k',
  r4k: '4k',
});
export type WiroGptImage2Resolution =
  (typeof WiroGptImage2Resolution)[keyof typeof WiroGptImage2Resolution];

export const WiroGptImage2Ratio = enumValues({
  landscape16x9: '16:9',
  landscape3x2: '3:2',
  portrait2x3: '2:3',
  portrait3x4: '3:4',
  portrait9x16: '9:16',
  square: '1:1',
  standard4x3: '4:3',
});
export type WiroGptImage2Ratio =
  (typeof WiroGptImage2Ratio)[keyof typeof WiroGptImage2Ratio];

export const WiroGptImage2Quality = enumValues({
  high: 'high',
  low: 'low',
  medium: 'medium',
});
export type WiroGptImage2Quality =
  (typeof WiroGptImage2Quality)[keyof typeof WiroGptImage2Quality];

export const WiroGptImage2Background = enumValues({
  auto: 'auto',
  opaque: 'opaque',
});
export type WiroGptImage2Background =
  (typeof WiroGptImage2Background)[keyof typeof WiroGptImage2Background];

export const WiroGptImage2OutputFormat = enumValues({
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
});
export type WiroGptImage2OutputFormat =
  (typeof WiroGptImage2OutputFormat)[keyof typeof WiroGptImage2OutputFormat];

export const WiroGptImage2Moderation = enumValues({
  auto: 'auto',
  low: 'low',
});
export type WiroGptImage2Moderation =
  (typeof WiroGptImage2Moderation)[keyof typeof WiroGptImage2Moderation];

export const WiroNanoBananaProRatio = enumValues({
  landscape16x9: '16:9',
  landscape3x2: '3:2',
  landscape5x4: '5:4',
  portrait2x3: '2:3',
  portrait3x4: '3:4',
  portrait4x5: '4:5',
  portrait9x16: '9:16',
  square: '1:1',
  standard4x3: '4:3',
  ultrawide21x9: '21:9',
});
export type WiroNanoBananaProRatio =
  (typeof WiroNanoBananaProRatio)[keyof typeof WiroNanoBananaProRatio];

export const WiroNanoBananaProResolution = enumValues({
  r1k: '1K',
  r2k: '2K',
  r4k: '4K',
});
export type WiroNanoBananaProResolution =
  (typeof WiroNanoBananaProResolution)[keyof typeof WiroNanoBananaProResolution];

export const WiroNanoBananaProSafetySetting = enumValues({
  blockLowAndAbove: 'BLOCK_LOW_AND_ABOVE',
  blockMediumAndAbove: 'BLOCK_MEDIUM_AND_ABOVE',
  blockNone: 'BLOCK_NONE',
  blockOnlyHigh: 'BLOCK_ONLY_HIGH',
  off: 'OFF',
});
export type WiroNanoBananaProSafetySetting =
  (typeof WiroNanoBananaProSafetySetting)[keyof typeof WiroNanoBananaProSafetySetting];

export const WiroSeedreamV4Size = enumValues({
  landscape2304x1728: '2304x1728',
  landscape2496x1664: '2496x1664',
  landscape2560x1440: '2560x1440',
  panorama3024x1296: '3024x1296',
  portrait1440x2560: '1440x2560',
  portrait1664x2496: '1664x2496',
  portrait1728x2304: '1728x2304',
  square2048: '2048x2048',
});
export type WiroSeedreamV4Size =
  (typeof WiroSeedreamV4Size)[keyof typeof WiroSeedreamV4Size];

export const WiroGrokImagineImageRatio = enumValues({
  landscape16x9: '16:9',
  landscape19_5x9: '19.5:9',
  landscape20x9: '20:9',
  landscape2x1: '2:1',
  landscape3x2: '3:2',
  portrait1x2: '1:2',
  portrait2x3: '2:3',
  portrait3x4: '3:4',
  portrait9x16: '9:16',
  portrait9x19_5: '9:19.5',
  portrait9x20: '9:20',
  square: '1:1',
  standard4x3: '4:3',
});
export type WiroGrokImagineImageRatio =
  (typeof WiroGrokImagineImageRatio)[keyof typeof WiroGrokImagineImageRatio];

export const WiroGrokImagineImageResolution = enumValues({
  r1k: '1k',
  r2k: '2k',
});
export type WiroGrokImagineImageResolution =
  (typeof WiroGrokImagineImageResolution)[keyof typeof WiroGrokImagineImageResolution];

export const WiroRunwayGen45Ratio = enumValues({
  auto: 'auto',
  landscape16x9: '16:9',
  portrait3x4: '3:4',
  portrait9x16: '9:16',
  square: '1:1',
  standard4x3: '4:3',
  ultrawide21x9: '21:9',
});
export type WiroRunwayGen45Ratio =
  (typeof WiroRunwayGen45Ratio)[keyof typeof WiroRunwayGen45Ratio];

export const WiroRunwayGen45Moderation = enumValues({
  auto: 'auto',
  low: 'low',
});
export type WiroRunwayGen45Moderation =
  (typeof WiroRunwayGen45Moderation)[keyof typeof WiroRunwayGen45Moderation];

export const WiroSeedance20Resolution = enumValues({
  r1080p: '1080p',
  r480p: '480p',
  r4k: '4k',
  r720p: '720p',
});
export type WiroSeedance20Resolution =
  (typeof WiroSeedance20Resolution)[keyof typeof WiroSeedance20Resolution];

export const WiroSeedance20Ratio = enumValues({
  adaptive: 'adaptive',
  landscape16x9: '16:9',
  portrait3x4: '3:4',
  portrait9x16: '9:16',
  square: '1:1',
  standard4x3: '4:3',
  ultrawide21x9: '21:9',
});
export type WiroSeedance20Ratio =
  (typeof WiroSeedance20Ratio)[keyof typeof WiroSeedance20Ratio];

export const WiroKlingV3Mode = enumValues({
  pro: 'pro',
  standard: 'std',
  ultra4k: '4k',
});
export type WiroKlingV3Mode =
  (typeof WiroKlingV3Mode)[keyof typeof WiroKlingV3Mode];

export const WiroKlingV3Ratio = enumValues({
  landscape16x9: '16:9',
  portrait9x16: '9:16',
  square: '1:1',
});
export type WiroKlingV3Ratio =
  (typeof WiroKlingV3Ratio)[keyof typeof WiroKlingV3Ratio];

export const WiroKlingV3ShotType = enumValues({
  customize: 'customize',
  intelligence: 'intelligence',
});
export type WiroKlingV3ShotType =
  (typeof WiroKlingV3ShotType)[keyof typeof WiroKlingV3ShotType];

export const WiroVeo31Ratio = enumValues({
  landscape16x9: '16:9',
  matchInputImage: 'match_input_image',
  portrait9x16: '9:16',
});
export type WiroVeo31Ratio =
  (typeof WiroVeo31Ratio)[keyof typeof WiroVeo31Ratio];

export const WiroVeo31Resolution = enumValues({
  r1080p: '1080p',
  r4k: '4k',
  r720p: '720p',
});
export type WiroVeo31Resolution =
  (typeof WiroVeo31Resolution)[keyof typeof WiroVeo31Resolution];

export const WiroSora2ProResolution = enumValues({
  r1024p: '1024p',
  r1080p: '1080p',
  r720p: '720p',
});
export type WiroSora2ProResolution =
  (typeof WiroSora2ProResolution)[keyof typeof WiroSora2ProResolution];

export const WiroSora2ProRatio = enumValues({
  auto: 'auto',
  landscape16x9: '16:9',
  portrait9x16: '9:16',
});
export type WiroSora2ProRatio =
  (typeof WiroSora2ProRatio)[keyof typeof WiroSora2ProRatio];

export const WiroHailuo23FastResolution = enumValues({
  r1080p: '1080P',
  r768p: '768P',
});
export type WiroHailuo23FastResolution =
  (typeof WiroHailuo23FastResolution)[keyof typeof WiroHailuo23FastResolution];

export const WiroGrokImagineVideoRatio = enumValues({
  auto: 'auto',
  landscape16x9: '16:9',
  landscape3x2: '3:2',
  portrait2x3: '2:3',
  portrait3x4: '3:4',
  portrait9x16: '9:16',
  square: '1:1',
  standard4x3: '4:3',
});
export type WiroGrokImagineVideoRatio =
  (typeof WiroGrokImagineVideoRatio)[keyof typeof WiroGrokImagineVideoRatio];

export const WiroGrokImagineVideoResolution = enumValues({
  r480p: '480p',
  r720p: '720p',
});
export type WiroGrokImagineVideoResolution =
  (typeof WiroGrokImagineVideoResolution)[keyof typeof WiroGrokImagineVideoResolution];
