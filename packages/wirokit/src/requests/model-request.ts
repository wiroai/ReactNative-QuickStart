import { WiroModelId } from '../core/identifiers';
import type { WiroJson } from '../core/wiro-value';
import { WiroValidationError } from '../errors/wiro-error';
import { immutableJson } from '../models/model-utils';
import {
  WiroFlux2ProRequest,
  type WiroFlux2ProRequestOptions,
  WiroGptImage2Request,
  type WiroGptImage2RequestOptions,
  WiroGrokImagineImageRequest,
  type WiroGrokImagineImageRequestOptions,
  WiroGrokImagineVideoRequest,
  type WiroGrokImagineVideoRequestOptions,
  WiroHailuo23FastRequest,
  type WiroHailuo23FastRequestOptions,
  WiroKlingV3Request,
  type WiroKlingV3RequestOptions,
  WiroLyria3Request,
  type WiroLyria3RequestOptions,
  WiroNanoBananaProRequest,
  type WiroNanoBananaProRequestOptions,
  WiroRunwayGen45Request,
  type WiroRunwayGen45RequestOptions,
  WiroSeedance20Request,
  type WiroSeedance20RequestOptions,
  WiroSeedreamV4Request,
  type WiroSeedreamV4RequestOptions,
  WiroSora2ProRequest,
  type WiroSora2ProRequestOptions,
  WiroVeo31Request,
  type WiroVeo31RequestOptions,
} from './typed-requests';

export interface WiroModelRequest {
  readonly model: WiroModelId;
  parameters(): WiroJson;
}

export class WiroDynamicRequest implements WiroModelRequest {
  readonly model: WiroModelId;
  readonly #parameters: WiroJson;

  constructor(model: WiroModelId, parameters: WiroJson) {
    this.model = model;
    this.#parameters = immutableJson(parameters);
    Object.freeze(this);
  }

  parameters(): WiroJson {
    return immutableJson(this.#parameters);
  }
}

export const Wiro = Object.freeze({
  flux2Pro(options: WiroFlux2ProRequestOptions): WiroFlux2ProRequest {
    return new WiroFlux2ProRequest(options);
  },
  gptImage2(options: WiroGptImage2RequestOptions): WiroGptImage2Request {
    return new WiroGptImage2Request(options);
  },
  grokImagineImage(
    options: WiroGrokImagineImageRequestOptions,
  ): WiroGrokImagineImageRequest {
    return new WiroGrokImagineImageRequest(options);
  },
  grokImagineVideo(
    options: WiroGrokImagineVideoRequestOptions,
  ): WiroGrokImagineVideoRequest {
    return new WiroGrokImagineVideoRequest(options);
  },
  hailuo23Fast(
    options: WiroHailuo23FastRequestOptions,
  ): WiroHailuo23FastRequest {
    return new WiroHailuo23FastRequest(options);
  },
  klingV3(options: WiroKlingV3RequestOptions): WiroKlingV3Request {
    return new WiroKlingV3Request(options);
  },
  lyria3(options: WiroLyria3RequestOptions): WiroLyria3Request {
    return new WiroLyria3Request(options);
  },
  model(slug: string, parameters: WiroJson): WiroDynamicRequest {
    const model = WiroModelId.parse(slug);
    if (model === null) {
      throw new WiroValidationError(
        'slug must be a valid owner/project identifier.',
      );
    }
    return new WiroDynamicRequest(model, parameters);
  },
  nanoBananaPro(
    options: WiroNanoBananaProRequestOptions,
  ): WiroNanoBananaProRequest {
    return new WiroNanoBananaProRequest(options);
  },
  runwayGen45(options: WiroRunwayGen45RequestOptions): WiroRunwayGen45Request {
    return new WiroRunwayGen45Request(options);
  },
  seedance20(options: WiroSeedance20RequestOptions): WiroSeedance20Request {
    return new WiroSeedance20Request(options);
  },
  seedreamV4(options: WiroSeedreamV4RequestOptions): WiroSeedreamV4Request {
    return new WiroSeedreamV4Request(options);
  },
  sora2Pro(options: WiroSora2ProRequestOptions): WiroSora2ProRequest {
    return new WiroSora2ProRequest(options);
  },
  veo31(options: WiroVeo31RequestOptions): WiroVeo31Request {
    return new WiroVeo31Request(options);
  },
});
