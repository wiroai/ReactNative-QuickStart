import { describe, expect, it } from 'vitest';

import {
  parseWiroJson,
  WiroApiError,
  WiroExploreCategory,
  WiroFileModelParameter,
  WiroModel,
  WiroModelParameter,
  WiroModelParameterGroup,
  WiroModelSchema,
  WiroNumberModelParameter,
  WiroPaginatedResult,
  WiroSelectModelParameter,
  WiroTextModelParameter,
  WiroUnknownModelParameter,
  WiroValue,
} from '../src';

describe('discovery model decoding', () => {
  it('parses clean slugs, stringified stats, and raw fields', () => {
    const model = WiroModel.parse(
      parseWiroJson(
        JSON.stringify({
          categories: ['image', 7, true],
          cleanslugowner: 'openai',
          cleanslugproject: 'gpt-image-2',
          futureField: { retained: true },
          id: 42,
          image: 'https://cdn.example.com/a.png',
          samples: ['https://cdn.example.com/sample.png'],
          tags: ['openai'],
          taskstat: JSON.stringify({
            errorcount: 10,
            lastruntime: 1_700_000_000,
            runcount: '100',
            successcount: 90,
          }),
          title: 'GPT Image 2',
        }),
      ),
    );

    expect(model.id).toBe('42');
    expect(model.owner).toBe('openai');
    expect(model.slug).toBe('gpt-image-2');
    expect(model.modelId?.slug).toBe('openai/gpt-image-2');
    expect(model.categories).toEqual(['image', '7', 'true']);
    expect(model.taskStats).toMatchObject({
      errorCount: 10,
      runCount: 100,
      successCount: 90,
    });
    expect(model.taskStats?.lastRunTime?.toISOString()).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(model.imageUrl?.toString()).toBe('https://cdn.example.com/a.png');
    expect(model.raw.futureField).toBeDefined();
    expect(Object.isFrozen(model.raw)).toBe(true);
    expect(Object.isFrozen(model.categories)).toBe(true);
  });

  it('uses slug fallbacks and rejects invalid derived IDs', () => {
    const fallback = WiroModel.parse(
      parseWiroJson('{"slugowner":"owner","slugproject":"project"}'),
    );
    const invalid = WiroModel.parse(
      parseWiroJson('{"slugowner":"bad owner","slugproject":"project"}'),
    );

    expect(fallback.modelId?.slug).toBe('owner/project');
    expect(invalid.modelId).toBeNull();
  });

  it('defensively returns mutable platform values', () => {
    const model = WiroModel.parse(
      parseWiroJson(
        '{"image":"https://example.com/image.png",' +
          '"taskstat":{"lastruntime":1700000000000}}',
      ),
    );
    const firstUrl = model.imageUrl;
    const firstDate = model.taskStats?.lastRunTime;
    if (firstUrl !== undefined) {
      firstUrl.pathname = '/changed';
    }
    firstDate?.setTime(0);

    expect(model.imageUrl?.pathname).toBe('/image.png');
    expect(model.taskStats?.lastRunTime?.getTime()).toBe(1_700_000_000_000);
  });

  it('uses safe defaults for sparse models and categories', () => {
    const model = WiroModel.parse(parseWiroJson('{}'));
    const category = WiroExploreCategory.parse(parseWiroJson('{}'));

    expect(model).toMatchObject({
      categories: [],
      id: '',
      owner: '',
      samples: [],
      slug: '',
      tags: [],
      title: undefined,
    });
    expect(model.imageUrl).toBeUndefined();
    expect(model.taskStats).toBeUndefined();
    expect(category).toMatchObject({
      id: '',
      models: [],
      title: '',
      total: 0,
    });
    expect(category.url).toBeUndefined();
  });

  it('parses paginated errors and skips invalid items', () => {
    const page = WiroPaginatedResult.parse(
      parseWiroJson(
        JSON.stringify({
          errors: [{ code: 42, message: 'nope' }, { future: true }],
          result: false,
          tool: [
            {},
            7,
            {
              id: 'one',
              slugowner: 'owner',
              slugproject: 'project',
            },
          ],
          total: '3',
        }),
      ),
      'tool',
      WiroModel.parse,
    );

    expect(page.isSuccess).toBe(false);
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.errors).toEqual([
      new WiroApiError({ code: '42', message: 'nope' }),
      new WiroApiError({
        message: 'Unknown Wiro API error',
      }),
    ]);
    expect(Object.isFrozen(page.items)).toBe(true);
  });
});

describe('model schema decoding and validation', () => {
  it('decodes known and unknown parameter kinds', () => {
    const schema = WiroModelSchema.parse(schemaFixture());

    expect(schema.parameters).toHaveLength(5);
    expect(schema.parameters[0]).toBeInstanceOf(WiroTextModelParameter);
    expect(schema.parameters[1]).toBeInstanceOf(WiroSelectModelParameter);
    expect(schema.parameters[2]).toBeInstanceOf(WiroNumberModelParameter);
    expect(schema.parameters[3]).toBeInstanceOf(WiroFileModelParameter);
    expect(schema.parameters[4]).toBeInstanceOf(WiroUnknownModelParameter);

    const unknown = schema.parameters[4];
    expect(unknown).toMatchObject({
      kind: 'unknown',
      type: 'futureType',
    });
    if (unknown instanceof WiroUnknownModelParameter) {
      expect(unknown.defaultValue?.kind).toBe('object');
      expect(unknown.info.raw.future).toBeDefined();
    }
    expect(schema.readme).toBe('Use safely.');
    expect(Object.isFrozen(schema.parameters)).toBe(true);
  });

  it('uses safe defaults for sparse schemas and pages', () => {
    const sparse = parseWiroJson('{}');
    const schema = WiroModelSchema.parse(sparse);
    const page = WiroPaginatedResult.parse(sparse, 'tool', WiroModel.parse);

    expect(schema.parameters).toEqual([]);
    expect(schema.parameterGroups).toEqual([]);
    expect(schema.readme).toBeUndefined();
    expect(page).toMatchObject({
      errors: [],
      isSuccess: false,
      items: [],
      total: 0,
    });
  });

  it.each([
    ['range', WiroNumberModelParameter],
    ['numeric', WiroNumberModelParameter],
    ['integer', WiroNumberModelParameter],
    ['float', WiroNumberModelParameter],
    ['text', WiroTextModelParameter],
    ['multifileinput', WiroFileModelParameter],
    ['combinefileinput', WiroFileModelParameter],
    ['SELECT', WiroSelectModelParameter],
  ])('maps %s to the compatible parameter kind', (type, kind) => {
    const parameter = WiroModelParameter.parse(
      parseWiroJson(JSON.stringify({ id: 'value', type })),
    );

    expect(parameter).toBeInstanceOf(kind);
  });

  it('validates required, select, and numeric constraints', () => {
    const schema = WiroModelSchema.parse(schemaFixture());

    expect(
      schema.validate({
        extra: WiroValue.string('allowed'),
        outputFormat: WiroValue.string('png'),
        prompt: WiroValue.string('cat'),
        width: WiroValue.number(1024),
      }),
    ).toEqual([]);
    expect(schema.validate({})).toContain('prompt is required');
    expect(
      schema.validate({
        outputFormat: WiroValue.string('gif'),
        prompt: WiroValue.string('cat'),
      }),
    ).toContain('outputFormat must be one of: jpeg, png');
    expect(
      schema.validate({
        prompt: WiroValue.string('cat'),
        width: WiroValue.string('wide'),
      }),
    ).toContain('width must be numeric');
    expect(
      schema.validate({
        prompt: WiroValue.string('cat'),
        width: WiroValue.number(32),
      }),
    ).toContain('width must be at least 64');
    expect(
      schema.validate({
        prompt: WiroValue.string('cat'),
        width: WiroValue.number(4096),
      }),
    ).toContain('width must be at most 2048');
    expect(schema.validate({ prompt: WiroValue.null })).toContain(
      'prompt is required',
    );
  });

  it('allows arbitrary values for text, file, and unknown kinds', () => {
    const schema = WiroModelSchema.parse(schemaFixture());

    expect(
      schema.validate({
        inputImage: WiroValue.number(12),
        magic: WiroValue.array([]),
        prompt: WiroValue.object({}),
      }),
    ).toEqual([]);
  });

  it('decodes nested object strings and reports malformed entries', () => {
    const malformed: string[] = [];
    const group = WiroModelParameterGroup.parse(
      parseWiroJson(
        JSON.stringify({
          items: [
            JSON.stringify({
              id: 'nested',
              type: 'text',
            }),
            '{"bad"',
            {},
            3,
          ],
          title: 'Nested',
        }),
      ),
      (raw) => malformed.push(raw),
    );

    expect(group.parameters).toHaveLength(1);
    expect(group.parameters[0]?.name).toBe('nested');
    expect(malformed).toEqual(['{"bad"']);
  });
});

function schemaFixture() {
  return parseWiroJson(
    JSON.stringify({
      id: '1',
      parameters: [
        {
          futureGroupField: true,
          items: [
            {
              default: 'hello',
              id: 'prompt',
              label: 'Prompt',
              required: true,
              type: 'textarea',
            },
            {
              default: 'png',
              id: 'outputFormat',
              label: 'Output',
              options: [
                { label: 'JPEG', value: 'jpeg' },
                { label: 'PNG', value: 'png' },
              ],
              type: 'select',
            },
            {
              default: 1024,
              id: 'width',
              label: 'Width',
              max: 2048,
              min: 64,
              step: 16,
              type: 'number',
            },
            {
              id: 'inputImage',
              label: 'Input',
              type: 'fileinput',
            },
            {
              default: { x: 1 },
              future: true,
              id: 'magic',
              label: 'Magic',
              type: 'futureType',
            },
          ],
          title: 'Inputs',
        },
      ],
      readme: 'Use safely.',
      slugowner: 'black-forest-labs',
      slugproject: 'flux-2-pro',
    }),
  );
}
