import { WiroModelId } from '../core/identifiers';
import type { WiroJson } from '../core/wiro-value';
import { WiroValidationError } from '../errors/wiro-error';
import { immutableJson } from '../models/model-utils';

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
  model(slug: string, parameters: WiroJson): WiroDynamicRequest {
    const model = WiroModelId.parse(slug);
    if (model === null) {
      throw new WiroValidationError(
        'slug must be a valid owner/project identifier.',
      );
    }
    return new WiroDynamicRequest(model, parameters);
  },
});
