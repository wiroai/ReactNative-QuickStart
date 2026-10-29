import {
  type WiroJson,
  WiroNullValue,
  type WiroValue,
} from '../core/wiro-value';
import {
  type MalformedJsonHandler,
  readBoolean,
  readDouble,
  readObjects,
  readString,
} from '../internal/json-reader';
import { WiroModel } from './model';
import { immutableArray, immutableJson } from './model-utils';

export interface WiroModelParameterOptionOptions {
  readonly label: string;
  readonly value: string;
}

export class WiroModelParameterOption {
  readonly label: string;
  readonly value: string;

  constructor(options: WiroModelParameterOptionOptions) {
    this.label = options.label;
    this.value = options.value;
    Object.freeze(this);
  }

  static parse(json: WiroJson): WiroModelParameterOption {
    return new WiroModelParameterOption({
      label: readString(json.label) ?? '',
      value: readString(json.value) ?? '',
    });
  }
}

export interface WiroModelParameterInfoOptions {
  readonly description?: string | undefined;
  readonly isRequired: boolean;
  readonly label: string;
  readonly name: string;
  readonly note?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly raw: WiroJson;
}

export class WiroModelParameterInfo {
  readonly description: string | undefined;
  readonly isRequired: boolean;
  readonly label: string;
  readonly name: string;
  readonly note: string | undefined;
  readonly placeholder: string | undefined;
  readonly raw: WiroJson;

  constructor(options: WiroModelParameterInfoOptions) {
    this.description = options.description;
    this.isRequired = options.isRequired;
    this.label = options.label;
    this.name = options.name;
    this.note = options.note;
    this.placeholder = options.placeholder;
    this.raw = immutableJson(options.raw);
    Object.freeze(this);
  }
}

abstract class WiroModelParameterBase {
  abstract readonly kind: 'select' | 'number' | 'text' | 'file' | 'unknown';
  readonly info: WiroModelParameterInfo;

  protected constructor(info: WiroModelParameterInfo) {
    this.info = info;
  }

  get name(): string {
    return this.info.name;
  }

  get isRequired(): boolean {
    return this.info.isRequired;
  }
}

export interface WiroSelectModelParameterOptions {
  readonly defaultValue?: string | undefined;
  readonly info: WiroModelParameterInfo;
  readonly options?: readonly WiroModelParameterOption[];
}

export class WiroSelectModelParameter extends WiroModelParameterBase {
  readonly kind = 'select';
  readonly defaultValue: string | undefined;
  readonly options: readonly WiroModelParameterOption[];

  constructor(options: WiroSelectModelParameterOptions) {
    super(options.info);
    this.defaultValue = options.defaultValue;
    this.options = immutableArray(options.options ?? []);
    Object.freeze(this);
  }
}

export interface WiroNumberModelParameterOptions {
  readonly defaultValue?: number | undefined;
  readonly info: WiroModelParameterInfo;
  readonly maximum?: number | undefined;
  readonly minimum?: number | undefined;
  readonly step?: number | undefined;
}

export class WiroNumberModelParameter extends WiroModelParameterBase {
  readonly kind = 'number';
  readonly defaultValue: number | undefined;
  readonly maximum: number | undefined;
  readonly minimum: number | undefined;
  readonly step: number | undefined;

  constructor(options: WiroNumberModelParameterOptions) {
    super(options.info);
    this.defaultValue = options.defaultValue;
    this.maximum = options.maximum;
    this.minimum = options.minimum;
    this.step = options.step;
    Object.freeze(this);
  }
}

export interface WiroTextModelParameterOptions {
  readonly defaultValue?: string | undefined;
  readonly info: WiroModelParameterInfo;
}

export class WiroTextModelParameter extends WiroModelParameterBase {
  readonly kind = 'text';
  readonly defaultValue: string | undefined;

  constructor(options: WiroTextModelParameterOptions) {
    super(options.info);
    this.defaultValue = options.defaultValue;
    Object.freeze(this);
  }
}

export class WiroFileModelParameter extends WiroModelParameterBase {
  readonly kind = 'file';

  constructor(info: WiroModelParameterInfo) {
    super(info);
    Object.freeze(this);
  }
}

export interface WiroUnknownModelParameterOptions {
  readonly defaultValue?: WiroValue | undefined;
  readonly info: WiroModelParameterInfo;
  readonly type: string;
}

export class WiroUnknownModelParameter extends WiroModelParameterBase {
  readonly kind = 'unknown';
  readonly defaultValue: WiroValue | undefined;
  readonly type: string;

  constructor(options: WiroUnknownModelParameterOptions) {
    super(options.info);
    this.defaultValue = options.defaultValue;
    this.type = options.type;
    Object.freeze(this);
  }
}

export type WiroModelParameter =
  | WiroSelectModelParameter
  | WiroNumberModelParameter
  | WiroTextModelParameter
  | WiroFileModelParameter
  | WiroUnknownModelParameter;

export const WiroModelParameter = Object.freeze({
  parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroModelParameter {
    return parseWiroModelParameter(json, onMalformedJson);
  },
});

export interface WiroModelParameterGroupOptions {
  readonly parameters?: readonly WiroModelParameter[];
  readonly raw: WiroJson;
  readonly title: string;
}

export class WiroModelParameterGroup {
  readonly parameters: readonly WiroModelParameter[];
  readonly raw: WiroJson;
  readonly title: string;

  constructor(options: WiroModelParameterGroupOptions) {
    this.parameters = immutableArray(options.parameters ?? []);
    this.raw = immutableJson(options.raw);
    this.title = options.title;
    Object.freeze(this);
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroModelParameterGroup {
    return new WiroModelParameterGroup({
      parameters: readObjects(json.items, onMalformedJson).map((item) =>
        parseWiroModelParameter(item, onMalformedJson),
      ),
      raw: json,
      title: readString(json.title) ?? '',
    });
  }
}

export interface WiroModelSchemaOptions {
  readonly model: WiroModel;
  readonly parameterGroups?: readonly WiroModelParameterGroup[];
  readonly raw: WiroJson;
  readonly readme?: string | undefined;
}

export class WiroModelSchema {
  readonly model: WiroModel;
  readonly parameterGroups: readonly WiroModelParameterGroup[];
  readonly parameters: readonly WiroModelParameter[];
  readonly raw: WiroJson;
  readonly readme: string | undefined;

  constructor(options: WiroModelSchemaOptions) {
    this.model = options.model;
    this.parameterGroups = immutableArray(options.parameterGroups ?? []);
    this.parameters = immutableArray(
      this.parameterGroups.flatMap((group) => group.parameters),
    );
    this.raw = immutableJson(options.raw);
    this.readme = options.readme;
    Object.freeze(this);
  }

  validate(parameters: WiroJson): readonly string[] {
    const errors: string[] = [];

    for (const parameter of this.parameters) {
      const value = parameters[parameter.name];
      const isPresent =
        value !== undefined && !(value instanceof WiroNullValue);

      if (parameter.isRequired && !isPresent) {
        errors.push(`${parameter.name} is required`);
        continue;
      }
      if (!isPresent) {
        continue;
      }

      if (parameter instanceof WiroSelectModelParameter) {
        validateSelectParameter(parameter, value, errors);
      } else if (parameter instanceof WiroNumberModelParameter) {
        validateNumberParameter(parameter, value, errors);
      }
    }

    return Object.freeze(errors);
  }

  static parse(
    json: WiroJson,
    onMalformedJson?: MalformedJsonHandler,
  ): WiroModelSchema {
    return new WiroModelSchema({
      model: WiroModel.parse(json, onMalformedJson),
      parameterGroups: readObjects(json.parameters, onMalformedJson).map(
        (group) => WiroModelParameterGroup.parse(group, onMalformedJson),
      ),
      raw: json,
      readme: readString(json.readme),
    });
  }
}

function parseWiroModelParameter(
  json: WiroJson,
  onMalformedJson?: MalformedJsonHandler,
): WiroModelParameter {
  const type = readString(json.type) ?? '';
  const info = new WiroModelParameterInfo({
    description: readString(json.description),
    isRequired: readBoolean(json.required) ?? false,
    label: readString(json.label) ?? '',
    name: readString(json.id) ?? '',
    note: readString(json.note),
    placeholder: readString(json.placeholder),
    raw: json,
  });
  const options = readObjects(json.options, onMalformedJson).map(
    WiroModelParameterOption.parse,
  );

  switch (type.toLowerCase()) {
    case 'select':
      return new WiroSelectModelParameter({
        defaultValue: readString(json.default),
        info,
        options,
      });
    case 'range':
    case 'number':
    case 'numeric':
    case 'integer':
    case 'float':
      return new WiroNumberModelParameter({
        defaultValue: readDouble(json.default),
        info,
        maximum: readDouble(json.max),
        minimum: readDouble(json.min),
        step: readDouble(json.step),
      });
    case 'text':
    case 'textarea':
      return new WiroTextModelParameter({
        defaultValue: readString(json.default),
        info,
      });
    case 'fileinput':
    case 'multifileinput':
    case 'combinefileinput':
      return new WiroFileModelParameter(info);
    default:
      return new WiroUnknownModelParameter({
        defaultValue: json.default,
        info,
        type,
      });
  }
}

function validateSelectParameter(
  parameter: WiroSelectModelParameter,
  value: WiroValue,
  errors: string[],
): void {
  const selected = readString(value);
  if (
    selected === undefined ||
    !parameter.options.some((option) => option.value === selected)
  ) {
    errors.push(
      `${parameter.name} must be one of: ` +
        parameter.options.map((option) => option.value).join(', '),
    );
  }
}

function validateNumberParameter(
  parameter: WiroNumberModelParameter,
  value: WiroValue,
  errors: string[],
): void {
  const number = readDouble(value);
  if (number === undefined) {
    errors.push(`${parameter.name} must be numeric`);
    return;
  }
  if (parameter.minimum !== undefined && number < parameter.minimum) {
    errors.push(
      `${parameter.name} must be at least ` + formatNumber(parameter.minimum),
    );
  }
  if (parameter.maximum !== undefined && number > parameter.maximum) {
    errors.push(
      `${parameter.name} must be at most ` + formatNumber(parameter.maximum),
    );
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : String(value);
}
